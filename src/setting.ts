import * as vscode from 'vscode';

interface Setting {
    executable: string,
    mode: string,
    host: string,
    port: number,
}

export function getSetting(): Setting | undefined {
    const setting = vscode.workspace.getConfiguration('clice')
    const executable = setting.get<string>('executable');
    const mode = setting.get<string>('mode');

    if (!executable || executable === "") {
        vscode.window.showErrorMessage("The path of clice executable is not set, please set and restart the extension.");
        return undefined
    }

    if (mode !== "pipe" && mode !== "socket") {
        vscode.window.showErrorMessage(`Unexpected mode: ${mode}`);
        return undefined
    }

    const host = setting.get<string>('host')!;
    const port = setting.get<number>('port')!;

    return {
        executable, mode, host, port,
    }
}