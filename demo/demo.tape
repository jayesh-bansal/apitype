Output demo.gif

Set FontSize 13
Set Width 920
Set Height 580
Set Theme "Catppuccin Mocha"
Set Padding 24
Set Shell "cmd"
Set WindowBar Colorful
Set WindowBarSize 28

Sleep 1s

# Scene 1 — Zod (default)
Type "node F:/Coding/Working/apitype/dist/cli.js demo/user.json --name User"
Sleep 400ms
Enter
Sleep 3s

Sleep 1.5s

# Scene 2 — TypeBox
Type "node F:/Coding/Working/apitype/dist/cli.js demo/user.json --name User --format typebox"
Sleep 400ms
Enter
Sleep 3s

Sleep 1.5s

# Scene 3 — TypeScript only
Type "node F:/Coding/Working/apitype/dist/cli.js demo/user.json --name User --format typescript"
Sleep 400ms
Enter
Sleep 2.5s

Sleep 1s
