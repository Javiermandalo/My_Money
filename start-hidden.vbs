Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "C:\Users\javie\Desktop\My_Money"
shell.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\javie\Desktop\My_Money\src\server.js""", 0, False
