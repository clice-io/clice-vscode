import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface Setting {
    executable: string,
    resourceDir: string,
    mode: string,
    config: string | undefined,
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

    if (config && !fs.existsSync(config)) {
        vscode.window.showErrorMessage(`Unexpected error, config file not found: ${config}`);
        return undefined
    } else if (!config && vscode.workspace.workspaceFolders) {
        const tmp = path.resolve(vscode.workspace.workspaceFolders[0].uri.fsPath, "clice.toml");
        if (fs.existsSync(tmp)) {
            config = tmp;
        }
    }

    return {
        executable, resourceDir, mode, config,
    }
}