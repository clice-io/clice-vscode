import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { workspace, window, ExtensionContext, OutputChannel } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, Trace, StreamInfo, TextDocumentIdentifier } from 'vscode-languageclient/node';

let client: LanguageClient;

export async function registerCommands(client: LanguageClient, context: ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand("clice.restart", async () => {
		await client.restart();
	}));
}

interface Setting {
	executable: string,
	resourceDir: string,
	mode: string,
	config: string | undefined,
}

function getSetting(): Setting | undefined {
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

export async function activate(context: ExtensionContext) {
	console.log('Congratulations, your extension "clice" is now active!');

	const channel = window.createOutputChannel('clice');
	const verboseChannel = window.createOutputChannel('clice-verbose');

	const setting = getSetting();
	if (!setting) {
		return;
	}

	let serverOptions: ServerOptions | (() => Promise<StreamInfo>);

	if (setting.mode === "pipe") {
		let args = ["--mode=pipe", `--resource-dir=${setting.resourceDir}`];
		if (setting.config) {
			args.push(`--config=${setting.config}`);
		}
		serverOptions = {
			run: { command: setting.executable, args: args },
			debug: { command: setting.executable, args: args }
		};
	} else if (setting.mode == "socket") {
		serverOptions = (): Promise<StreamInfo> => {
			return new Promise((resolve, reject) => {
				const client = new net.Socket();
				client.connect(50051, '127.0.0.1', () => {
					resolve({
						reader: client,
						writer: client,
					});
				});
				client.on('error', (error) => {
					reject(error);
				});
			});
		};
	} else {
		vscode.window.showErrorMessage("Invalid mode, please set the mode to 'pipe' or 'socket'.");
		return
	}

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'cpp' }],
		outputChannel: channel,
		traceOutputChannel: verboseChannel,
		synchronize: {
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	client = new LanguageClient(
		'clice-vscode',
		'clice-vscode',
		serverOptions,
		clientOptions
	);

	await registerCommands(client, context);

	await client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	let ret = client.stop();
	return ret;
}