import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface Setting {
    executable: string,
    resourceDir: string,
    mode: string,
    host: string,
    port: number,
}

export function getSetting(): Setting | undefined {
    const setting = vscode.workspace.getConfiguration('clice')
    const executable = setting.get<string>('executable');
    const mode = setting.get<string>('mode');
    let config = setting.get<string>('config');

    if (!executable || executable === "") {
        vscode.window.showErrorMessage("The path of clice executable is not set, please set and restart the extension.");
        return undefined
    }

    let resourceDir = path.resolve(path.dirname(executable), "..", "lib", "clang", "20")
    if (!fs.existsSync(resourceDir)) {
        /// FIXME: Currently clice is not located in bin, fix it in the future.
        resourceDir = path.resolve(path.dirname(executable), "lib", "clang", "20")
    }

    if (!fs.existsSync(resourceDir)) {
        vscode.window.showErrorMessage(`Unexpected error, resource dir not found: ${resourceDir}`);
        return undefined
    }

    if (mode !== "pipe" && mode !== "socket") {
        vscode.window.showErrorMessage(`Unexpected mode: ${mode}`);
        return undefined
    }

    const host = setting.get<string>('host')!;
    const port = setting.get<number>('port')!;

    return {
        executable, resourceDir, mode, host, port,
    }
}