' ターミナルを表示せずにサーバー起動
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "py -m http.server 8080", 0, False

' ブラウザを開く（1秒待ってから）
WScript.Sleep 1000
shell.Run "cmd /c start http://localhost:8080", 0, False
