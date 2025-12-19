#!/usr/bin/python
# -*- coding: utf-8 -*-
#
# TalkTalkTalk
#
# is an easy-installable small chat room, with chat history. 
# 
# author:  Joseph Ernest (twitter: @JosephErnest)
# url:     http://github.com/josephernest/talktalktalk
# license: MIT license


import sys, json, bleach, time, threading, random, re
import chess
try:
    import dbm.dumb as dumbdbm
except ImportError:
    import dumbdbm
import daemon
from bottle import route, run, view, request, post, ServerAdapter, get, static_file
from gevent import pywsgi
from geventwebsocket.handler import WebSocketHandler
from geventwebsocket.exceptions import WebSocketError
from collections import deque
from config import PORT, HOST, ADMINNAME, ADMINHIDDENNAME, ALLOWEDTAGS
from chess_4player import ChessBoard4Player, PlayerColor

idx = 0
next_game_id = 1

def websocket(callback):
    def wrapper(*args, **kwargs):
        callback(request.environ.get('wsgi.websocket'), *args, **kwargs)
    return wrapper

class GeventWebSocketServer(ServerAdapter):
    def run(self, handler):
        server = pywsgi.WSGIServer((self.host, self.port), handler, handler_class=WebSocketHandler)
        server.serve_forever()

def main():
    global idx
    db = dumbdbm.open('talktalktalk.db', 'c')

    def db_get_str(i):
        v = db[str(i)]
        if isinstance(v, bytes):
            try:
                return v.decode('utf-8')
            except UnicodeDecodeError:
                return v.decode('latin-1', 'replace')
        return v
    idx = len(db)

    users = {}
    pings = {}
    usermessagetimes = {}
    username_to_ws = {}
    invites = {}              # key: (inviter, target) -> timestamp
    games = {}                # key: game_id -> {'board': chess.Board(), 'white': str, 'black': str, 'over': bool}

    # 4-player chess support
    invites_4player = {}      # key: (inviter, mode) -> {'players': [inviter, ...], 'timestamp': time, 'accepted_by': set()}
    games_4player = {}        # key: game_id -> {'board': ChessBoard4Player(), 'players': {color: username}, 'over': bool}

    def send_userlist():
        for u in users.keys():
            if not u.closed:
                u.send(json.dumps({'type' : 'userlist', 'connected': list(users.values())}))

    def get_ws_by_username(name):
        # prefer exact mapping, else search
        ws2 = username_to_ws.get(name)
        if ws2 and ws2 in users and users[ws2] == name:
            return ws2
        for w, n in users.items():
            if n == name:
                return w
        return None

    def send_to_username(name, payload_dict):
        w = get_ws_by_username(name)
        if w and not w.closed:
            w.send(json.dumps(payload_dict))
            return True
        return False

    def broadcast_game(g, payload_dict):
        send_to_username(g['white'], payload_dict)
        send_to_username(g['black'], payload_dict)

    def clean_username(usr, ws):
        username = bleach.clean(usr, tags=ALLOWEDTAGS, strip=True)
        #username = re.sub('[‍ :]', '', username)      # removes " ", ":", and the evil char "‍" http://unicode-table.com/fr/200D/
        username = re.sub(r'\W+', '', username)       # because of spam and usage of malicious utf8 characters, let's use alphanumeric usernames only for now
        username = username[:16]
        if username.lower() == ADMINNAME or username == '':
            username = 'user' + str(random.randint(0, 1000))
            ws.send(json.dumps({'type' : 'usernameunavailable', 'username' : username}))
        elif username.lower() == ADMINHIDDENNAME:
            username = ADMINNAME
            ws.send(json.dumps({'type' : 'displayeduser', 'username' : username}))
        return username            

    def dbworker():        # when a user disappears during more than 30 seconds (+/- 10), remove him/her from the userlist
        while True:
            userlistchanged = False
            t = time.time()
            for ws in users.copy():
                if t - pings[ws] > 30: 
                    del users[ws]
                    del pings[ws]
                    userlistchanged = True
            if userlistchanged:
                send_userlist()
            time.sleep(10)

    dbworkerThread = threading.Thread(target=dbworker)
    dbworkerThread.daemon = True
    dbworkerThread.start()

    @get('/ws', apply=[websocket])
    def chat(ws):
        global idx
        usermessagetimes[ws] = deque(maxlen=10)
        while True:
            try:
                receivedmsg = ws.receive()
                if receivedmsg is not None:
                    # In Python 3, strings are already Unicode
                    if isinstance(receivedmsg, bytes):
                        receivedmsg = receivedmsg.decode('utf8')
                    if len(receivedmsg) > 4096:      # this user is probably a spammer
                        ws.send(json.dumps({'type' : 'flood'}))
                        break

                    pings[ws] = time.time()

                    if receivedmsg == 'ping':         # ping/pong packet to make sure connection is still alive
                        ws.send('id' + str(idx-1))    # send the latest message id in return
                        if ws not in users:           # was deleted by dbworker
                            ws.send(json.dumps({'type' : 'username'}))
                    else:
                        usermessagetimes[ws].append(time.time())                           # flood control
                        if len(usermessagetimes[ws]) == usermessagetimes[ws].maxlen:
                            if usermessagetimes[ws][-1] - usermessagetimes[ws][0] < 5:     # if more than 10 messages in 5 seconds (including ping messages)
                                ws.send(json.dumps({'type' : 'flood'}))                    # disconnect the spammer
                                break

                        msg = json.loads(receivedmsg)

                        if msg['type'] == 'message':
                            message = (bleach.clean(msg['message'], tags=ALLOWEDTAGS, strip=True)).strip()

                            if ws not in users:         # is this really mandatory ?
                                username = clean_username(msg['username'], ws)       
                                users[ws] = username
                                send_userlist()

                            if message:
                                if len(message) > 1000:
                                    message = message[:1000] + '...'
                                s = json.dumps({'type' : 'message', 'message': message, 'username': users[ws], 'id': idx, 'datetime': int(time.time())})
                                db[str(idx)] = s                # Neither dumbdbm nor shelve module allow integer as key... I'm still looking for a better solution!
                                idx += 1
                                for u in users.keys():
                                    u.send(s)

                        elif msg['type'] == 'chess_invite':
                            inviter = users.get(ws)
                            target = msg.get('to', '')
                            if not inviter or not target or inviter == target:
                                ws.send(json.dumps({'type': 'chess_error', 'message': 'Invalid invite'}))
                            else:
                                invites[(inviter, target)] = time.time()
                                ok = send_to_username(target, {'type': 'chess_invite', 'from': inviter})
                                if not ok:
                                    ws.send(json.dumps({'type': 'chess_error', 'message': 'User not available'}))

                        elif msg['type'] == 'chess_invite_accept':
                            target = users.get(ws)  # the acceptor
                            inviter = msg.get('from', '')
                            if not inviter or not target or (inviter, target) not in invites:
                                ws.send(json.dumps({'type': 'chess_error', 'message': 'Invite not found'}))
                            else:
                                # create game
                                global next_game_id
                                gid = next_game_id
                                next_game_id += 1
                                board = chess.Board()
                                if random.random() < 0.5:
                                    white, black = inviter, target
                                else:
                                    white, black = target, inviter
                                g = {'board': board, 'white': white, 'black': black, 'over': False}
                                games[gid] = g
                                # notify both
                                payload = {'type': 'chess_start', 'game_id': gid, 'white': white, 'black': black, 'fen': board.fen(), 'turn': 'white'}
                                broadcast_game(g, payload)
                                # cleanup invite
                                del invites[(inviter, target)]

                        elif msg['type'] == 'chess_move':
                            gid = msg.get('game_id')
                            src = msg.get('from')
                            dst = msg.get('to')
                            promo = (msg.get('promotion') or '').lower()
                            player = users.get(ws)
                            if gid not in games:
                                ws.send(json.dumps({'type': 'chess_error', 'message': 'Game not found'}))
                            else:
                                g = games[gid]
                                board = g['board']
                                if g['over']:
                                    ws.send(json.dumps({'type': 'chess_error', 'message': 'Game over'}))
                                else:
                                    expected_player = g['white'] if board.turn == chess.WHITE else g['black']
                                    if player != expected_player:
                                        ws.send(json.dumps({'type': 'chess_error', 'message': 'Not your turn'}))
                                    else:
                                        uci = (src or '') + (dst or '') + (promo if promo in ['q','r','b','n'] else '')
                                        try:
                                            move = chess.Move.from_uci(uci)
                                        except ValueError:
                                            ws.send(json.dumps({'type': 'chess_illegal', 'reason': 'parse'}))
                                            move = None
                                        if move and move in board.legal_moves:
                                            san = board.san(move)
                                            board.push(move)
                                            payload = {'type': 'chess_move', 'game_id': gid, 'from': src, 'to': dst, 'promotion': promo or None, 'san': san, 'fen': board.fen(), 'turn': 'white' if board.turn == chess.WHITE else 'black', 'check': board.is_check()}
                                            broadcast_game(g, payload)
                                            if board.is_game_over():
                                                g['over'] = True
                                                result = board.result()  # '1-0','0-1','1/2-1/2'
                                                reason = 'checkmate' if board.is_checkmate() else ('stalemate' if board.is_stalemate() else 'draw')
                                                broadcast_game(g, {'type': 'chess_over', 'game_id': gid, 'result': result, 'reason': reason, 'fen': board.fen()})
                                        else:
                                            ws.send(json.dumps({'type': 'chess_illegal', 'reason': 'illegal'}))

                        elif msg['type'] == 'chess_resign':
                            gid = msg.get('game_id')
                            player = users.get(ws)
                            if gid in games and not games[gid]['over']:
                                g = games[gid]
                                g['over'] = True
                                winner = g['black'] if player == g['white'] else g['white']
                                result = '1-0' if winner == g['white'] else '0-1'
                                broadcast_game(g, {'type': 'chess_over', 'game_id': gid, 'result': result, 'reason': 'resign', 'fen': g['board'].fen()})

                        elif msg['type'] == 'chess_4player_invite':
                            inviter = users.get(ws)
                            targets = msg.get('targets', [])
                            if not inviter or not isinstance(targets, list) or len(targets) != 3:
                                ws.send(json.dumps({'type': 'chess_error', 'message': 'Need exactly 3 other players'}))
                            elif inviter in targets:
                                ws.send(json.dumps({'type': 'chess_error', 'message': 'Cannot invite yourself'}))
                            else:
                                # Check all targets exist
                                all_exist = all(send_to_username(t, {'type': 'chess_4player_invite', 'from': inviter}) for t in targets)
                                if not all_exist:
                                    ws.send(json.dumps({'type': 'chess_error', 'message': 'Not all players available'}))
                                else:
                                    # Store the invite group
                                    key = (inviter, 'group')
                                    invites_4player[key] = {
                                        'inviter': inviter,
                                        'players': [inviter] + targets,
                                        'timestamp': time.time(),
                                        'accepted_by': set([inviter])
                                    }

                        elif msg['type'] == 'chess_4player_invite_accept':
                            acceptor = users.get(ws)
                            inviter = msg.get('from', '')
                            if not inviter or not acceptor:
                                ws.send(json.dumps({'type': 'chess_error', 'message': 'Invalid game invite'}))
                            else:
                                key = (inviter, 'group')
                                if key not in invites_4player:
                                    ws.send(json.dumps({'type': 'chess_error', 'message': 'Invite not found'}))
                                else:
                                    invite = invites_4player[key]
                                    if acceptor not in invite['players']:
                                        ws.send(json.dumps({'type': 'chess_error', 'message': 'Not in this invite'}))
                                    else:
                                        invite['accepted_by'].add(acceptor)

                                        # Check if all players accepted
                                        if len(invite['accepted_by']) == 4:
                                            # Create game
                                            global next_game_id
                                            gid = next_game_id
                                            next_game_id += 1

                                            # Initialize 4-player board
                                            board_4p = ChessBoard4Player()

                                            # Map players to colors
                                            players_list = invite['players']
                                            players_dict = {
                                                'white': players_list[0],
                                                'red': players_list[1],
                                                'black': players_list[2],
                                                'green': players_list[3]
                                            }

                                            g = {'board': board_4p, 'players': players_dict, 'over': False, 'colors': ['white', 'red', 'black', 'green']}
                                            games_4player[gid] = g

                                            # Notify all players
                                            for color, player in players_dict.items():
                                                player_ws = get_ws_by_username(player)
                                                if player_ws and not player_ws.closed:
                                                    player_ws.send(json.dumps({
                                                        'type': 'chess_4player_start',
                                                        'game_id': gid,
                                                        'players': players_dict,
                                                        'your_color': color,
                                                        'fen': board_4p.fen(),
                                                        'turn': board_4p.get_color_name(board_4p.current_player())
                                                    }))

                                            del invites_4player[key]

                        elif msg['type'] == 'chess_4player_move':
                            gid = msg.get('game_id')
                            src = msg.get('from')
                            dst = msg.get('to')
                            promo = (msg.get('promotion') or '').lower()
                            player = users.get(ws)

                            if gid not in games_4player:
                                ws.send(json.dumps({'type': 'chess_error', 'message': 'Game not found'}))
                            else:
                                g = games_4player[gid]
                                if g['over']:
                                    ws.send(json.dumps({'type': 'chess_error', 'message': 'Game over'}))
                                else:
                                    board_4p = g['board']
                                    expected_player = None
                                    for color, pname in g['players'].items():
                                        if board_4p.get_color_name(board_4p.current_player()) == color:
                                            expected_player = pname
                                            break

                                    if player != expected_player:
                                        ws.send(json.dumps({'type': 'chess_error', 'message': 'Not your turn'}))
                                    else:
                                        try:
                                            from_square = chess.parse_square(src)
                                            to_square = chess.parse_square(dst)

                                            result = board_4p.make_move(from_square, to_square, promo if promo in ['q','r','b','n'] else None)

                                            if not result['success']:
                                                ws.send(json.dumps({'type': 'chess_illegal', 'reason': 'illegal', 'message': result['message']}))
                                            else:
                                                payload = {
                                                    'type': 'chess_4player_move',
                                                    'game_id': gid,
                                                    'from': src,
                                                    'to': dst,
                                                    'promotion': promo or None,
                                                    'fen': result['fen'],
                                                    'turn': result['current_player'],
                                                    'eliminated': result.get('eliminated', False)
                                                }

                                                # Broadcast to all players
                                                for color, pname in g['players'].items():
                                                    player_ws = get_ws_by_username(pname)
                                                    if player_ws and not player_ws.closed:
                                                        player_ws.send(json.dumps(payload))

                                                # Check if game over
                                                if board_4p.is_game_over():
                                                    g['over'] = True
                                                    winner = board_4p.get_winner()
                                                    over_payload = {
                                                        'type': 'chess_4player_over',
                                                        'game_id': gid,
                                                        'winner': winner,
                                                        'reason': 'checkmate',
                                                        'fen': board_4p.fen()
                                                    }
                                                    for color, pname in g['players'].items():
                                                        player_ws = get_ws_by_username(pname)
                                                        if player_ws and not player_ws.closed:
                                                            player_ws.send(json.dumps(over_payload))
                                        except ValueError:
                                            ws.send(json.dumps({'type': 'chess_illegal', 'reason': 'parse'}))

                        elif msg['type'] == 'chess_4player_resign':
                            gid = msg.get('game_id')
                            player = users.get(ws)
                            if gid in games_4player and not games_4player[gid]['over']:
                                g = games_4player[gid]
                                g['over'] = True
                                # Find winner (last non-resigned player)
                                remaining = [color for color, pname in g['players'].items() if pname != player]
                                winner = remaining[0] if remaining else None

                                over_payload = {
                                    'type': 'chess_4player_over',
                                    'game_id': gid,
                                    'winner': winner,
                                    'reason': 'resign',
                                    'fen': g['board'].fen()
                                }
                                for color, pname in g['players'].items():
                                    player_ws = get_ws_by_username(pname)
                                    if player_ws and not player_ws.closed:
                                        player_ws.send(json.dumps(over_payload))

                        elif msg['type'] == 'chess_4player_resume_request':
                            gid = msg.get('game_id')
                            try:
                                if gid in games_4player:
                                    g = games_4player[gid]
                                    if not g['over']:
                                        board_4p = g['board']
                                        ws.send(json.dumps({
                                            'type': 'chess_4player_resume',
                                            'game_id': gid,
                                            'players': g['players'],
                                            'fen': board_4p.fen(),
                                            'turn': board_4p.get_color_name(board_4p.current_player())
                                        }))
                                else:
                                    # Find any active 4-player game for this user
                                    username = users.get(ws)
                                    if username:
                                        for gid2, g in games_4player.items():
                                            if not g['over'] and username in g['players'].values():
                                                board_4p = g['board']
                                                ws.send(json.dumps({
                                                    'type': 'chess_4player_resume',
                                                    'game_id': gid2,
                                                    'players': g['players'],
                                                    'fen': board_4p.fen(),
                                                    'turn': board_4p.get_color_name(board_4p.current_player())
                                                }))
                                                break
                            except Exception:
                                pass

                        elif msg['type'] == 'messagesbefore':
                            idbefore = msg['id']
                            ws.send(json.dumps({'type' : 'messages', 'before': 1, 'messages': [db_get_str(i) for i in range(max(0,idbefore - 100),idbefore)]}))

                        elif msg['type'] == 'messagesafter':
                            idafter = msg['id']
                            ws.send(json.dumps({'type' : 'messages', 'before': 0, 'messages': [db_get_str(i) for i in range(idafter,idx)]}))

                        elif msg['type'] == 'chess_resume_request':
                            gid = msg.get('game_id')
                            try:
                                if gid in games:
                                    g = games[gid]
                                    if not g['over']:
                                        turn = 'white' if g['board'].turn == chess.WHITE else 'black'
                                        ws.send(json.dumps({'type': 'chess_resume', 'game_id': gid, 'white': g['white'], 'black': g['black'], 'fen': g['board'].fen(), 'turn': turn}))
                                else:
                                    # fallback: find any active game for this user (if username known)
                                    username = users.get(ws)
                                    if username:
                                        for gid2, g in games.items():
                                            if not g['over'] and (g['white'] == username or g['black'] == username):
                                                turn = 'white' if g['board'].turn == chess.WHITE else 'black'
                                                ws.send(json.dumps({'type': 'chess_resume', 'game_id': gid2, 'white': g['white'], 'black': g['black'], 'fen': g['board'].fen(), 'turn': turn}))
                                                break
                            except Exception:
                                pass

                        elif msg['type'] == 'username':
                            username = clean_username(msg['username'], ws)
                            if ws not in users:          # welcome new user
                                ws.send(json.dumps({'type' : 'messages', 'before': 0, 'messages': [db_get_str(i) for i in range(max(0,idx - 100),idx)]}))
                            users[ws] = username
                            username_to_ws[username] = ws
                            send_userlist()
                            # notify user of any active chess game to allow rejoin after reload/disconnect
                            try:
                                for gid, g in games.items():
                                    if not g['over'] and (g['white'] == username or g['black'] == username):
                                        turn = 'white' if g['board'].turn == chess.WHITE else 'black'
                                        ws.send(json.dumps({'type': 'chess_resume', 'game_id': gid, 'white': g['white'], 'black': g['black'], 'fen': g['board'].fen(), 'turn': turn}))
                                        break

                                # Also check 4-player games
                                for gid, g in games_4player.items():
                                    if not g['over'] and username in g['players'].values():
                                        board_4p = g['board']
                                        ws.send(json.dumps({
                                            'type': 'chess_4player_resume',
                                            'game_id': gid,
                                            'players': g['players'],
                                            'fen': board_4p.fen(),
                                            'turn': board_4p.get_color_name(board_4p.current_player())
                                        }))
                                        break
                            except Exception:
                                pass
                else:
                    break
            except (WebSocketError, ValueError, UnicodeDecodeError):      # ValueError happens for example when "No JSON object could be decoded", would be interesting to log it
                break

        if ws in users:
            uname = users[ws]
            del users[ws]
            del pings[ws]
            if username_to_ws.get(uname) == ws:
                del username_to_ws[uname]
            send_userlist()

    @route('/')
    @route('/index.html')
    @view('talktalktalk.html')
    def index():
        context = {'request': request}
        return (context)

    @route('/popsound.mp3')
    def popsound():
        from bottle import response
        response.content_type = 'audio/mpeg'
        with open('popsound.mp3', 'rb') as f:
            data = f.read()
        return data        

    run(host=HOST, port=PORT, debug=True, server=GeventWebSocketServer)

class talktalktalk(daemon.Daemon):
    def run(self):
        main()

if len(sys.argv) == 1:           # command line interactive mode
    main()

elif len(sys.argv) == 2:         # daemon mode
    daemon = talktalktalk(pidfile='_.pid', stdout='log.txt', stderr='log.txt')
   
    if 'start' == sys.argv[1]: 
        daemon.start()
    elif 'stop' == sys.argv[1]: 
        daemon.stop()
    elif 'restart' == sys.argv[1]: 
        daemon.restart()
