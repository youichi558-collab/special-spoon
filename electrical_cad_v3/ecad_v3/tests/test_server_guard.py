#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""server.py の Host/Origin 検査と、catalog_db の置換リトライのテスト(2026-09-29 全体レビュー)

  1. 別サイト(Originがlocalhost以外)からのPOSTは断る。Originが無い(curl等)は通す
  2. 待ち受けが127.0.0.1のとき、Hostがlocalhost系以外(DNS rebinding)は断る
  3. LANに広げた(bind=0.0.0.0)ときはHostを検査しない
  4. 実際にHTTPで403が返り、正しいリクエストは通る
  5. catalog_db.build は、os.replace が一時的に PermissionError でも成功する
"""
import json, os, sys, tempfile, threading, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.dirname(HERE)
sys.path.insert(0, APP); sys.path.insert(0, os.path.join(APP, 'tools', 'catalog_db'))
import server, catalog_db

ng = 0
def ok(c, m):
    global ng
    if not c: ng += 1
    print(('  OK  ' if c else '  NG  ') + m)

ra = server.request_allowed
ok(ra('localhost:8080', 'http://localhost:8080', 'POST', '127.0.0.1'), '自分自身のPOSTは通る')
ok(ra('127.0.0.1:8080', 'http://127.0.0.1:8080', 'POST', '127.0.0.1'), '127.0.0.1のPOSTも通る')
ok(not ra('localhost:8080', 'https://evil.example', 'POST', '127.0.0.1'), '別サイトOriginのPOSTは断る')
ok(ra('localhost:8080', None, 'POST', '127.0.0.1'), 'Originなし(curl等)は通る')
ok(ra('localhost:8080', 'https://evil.example', 'GET', '127.0.0.1'), 'GETはOriginを見ない')
ok(not ra('evil.example:8080', None, 'GET', '127.0.0.1'), 'Hostが外部名(DNS rebinding)は断る')
ok(ra('192.168.0.5:8080', None, 'GET', '0.0.0.0'), 'LANに広げたときはHostを見ない')

# 実際にHTTPで
server.PORT = 0
httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
def req(headers, path='/api/serverinfo', data=None):
    r = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=data, headers=headers)
    try: return urllib.request.urlopen(r).status
    except urllib.error.HTTPError as e: return e.code
ok(req({}) == 200, 'GET /api/serverinfo は通る')
ok(req({'Host': 'evil.example'}) == 403, '外部Hostは403')
ok(req({'Origin': 'https://evil.example'}, '/api/backup/save', b'{}') == 403, '別サイトのPOSTは403')
ok(req({'Origin': f'http://127.0.0.1:{port}'}, '/api/backup/save', b'{}') != 403, '自分のOriginのPOSTは403にならない')
httpd.shutdown()

# 5. 置換リトライ
d = tempfile.mkdtemp(); csvd = os.path.join(d, 'csv'); os.makedirs(csvd)
open(os.path.join(csvd, 'a.csv'), 'w', encoding='utf-8').write('m,R1,coil,,,,,\n')
real = os.replace; calls = {'n': 0}
def flaky(a, b):
    calls['n'] += 1
    if calls['n'] <= 3: raise PermissionError('in use')
    return real(a, b)
os.replace = flaky
try:
    r = catalog_db.CatalogDB(csv_dir=csvd, data_dir=os.path.join(d, 'data')).build()
    ok(r['count'] == 1 and calls['n'] == 4, 'PermissionErrorが3回続いても作り直せる')
finally:
    os.replace = real
sys.exit(1 if ng else 0)
