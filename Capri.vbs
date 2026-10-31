' Starts Capri without any console window: only her icon shows up next to the clock.
' (While something still needs installing, the install window is shown so you can follow it.)
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
models = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\.ollama\models\manifests\registry.ollama.ai\library\qwen3-vl\8b-instruct"
installed = fso.FileExists(dir & "\brain\.venv\Scripts\python.exe") _
    And fso.FolderExists(dir & "\body\node_modules") _
    And fso.FileExists(dir & "\brain\models\kokoro-v1.0.int8.onnx") _
    And fso.FileExists(models)
If installed Then
    sh.Run """" & dir & "\installer\start-capri.bat""", 0, False
Else
    sh.Run """" & dir & "\installer\start-capri.bat""", 1, False
End If
