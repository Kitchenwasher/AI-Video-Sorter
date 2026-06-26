#ifndef AppName
  #define AppName "AI Video Sorter"
#endif
#ifndef AppPublisher
  #define AppPublisher "Kitchenwasher"
#endif
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef AppId
  #define AppId "{{E63E44A2-3075-40ED-B521-6D0E8A4C44F1}}"
#endif
#define SourceDir "..\dist\AI Video Sorter"
#define OutputDir "..\output"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=AI_Video_Sorter_Setup_{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayName={#AppName}
PrivilegesRequired=lowest
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{localappdata}\AI Video Sorter"
Name: "{localappdata}\AI Video Sorter\logs"

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; WorkingDir: "{app}"
Name: "{group}\Open Logs Folder"; Filename: "{sys}\explorer.exe"; Parameters: """{localappdata}\AI Video Sorter\logs"""
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppName}.exe"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
