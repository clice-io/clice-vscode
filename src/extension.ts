import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import { workspace, window, ExtensionContext, OutputChannel } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, Trace, StreamInfo } from 'vscode-languageclient/node';

import { highlightDocument } from './SemanticHighlight';

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
	console.log('Congratulations, your extension "clice" is now active!');

	const channel = window.createOutputChannel('clice');
	const verbose_channel = window.createOutputChannel('clice-verbose');

	const config = vscode.workspace.getConfiguration('clice')
	const executable = config.get<string>('executable');

	if (!executable || executable === "") {
		vscode.window.showErrorMessage("The path of clice executable is not set, please set and restart the extension.");
		return;
	}

	const mode = config.get<string>('mode');
	const configPath = config.get<string>('config');

	let serverOptions: ServerOptions | (() => Promise<StreamInfo>);
	if (mode === "pipe") {
		serverOptions = {
			run: { command: executable, args: ['--pipe=true', `--config=${configPath}`] },
			debug: { command: executable, args: ['--pipe=true', `--config=${configPath}`] }
		};
	} else if (mode == "socket") {
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
		traceOutputChannel: verbose_channel,
		synchronize: {
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		},
		middleware: {
			/// TODO: Implement the middleware
			///	provideDocumentSemanticTokens: async (document, token, next) => {
			///		let result = await next(document, token);
			///		let legend = client.initializeResult?.capabilities.semanticTokensProvider?.legend!;
			///		if (result) {
			///			highlightDocument(document, legend, result);
			///		}
			///		return result;
			///	}
		}
	};

	client = new LanguageClient(
		'clice-client',
		'clice-client',
		serverOptions,
		clientOptions
	);

	// Register the IndexAll command
	const indexAllCommand = vscode.commands.registerCommand('clice.indexAll', async () => {
		if (!client) {
			vscode.window.showErrorMessage('Language client not initialized');
			return;
		}

		try {
			client.sendNotification('index/all');
			vscode.window.showInformationMessage('Sent index/all notification to server.');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to send index/all: ${error}`);
		}
	});

	const indexCurrentCommand = vscode.commands.registerCommand('clice.indexCurrent', async () => {
		if (!client) {
			vscode.window.showErrorMessage('Language client not initialized');
			return;
		}

		try {
			client.sendNotification("index/current", { uri: window.activeTextEditor?.document.uri.toString() });
			vscode.window.showInformationMessage('Sent index/current notification to server.');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to send index/current: ${error}`);
		}
	});

	// Add the command to the context subscriptions
	context.subscriptions.push(indexAllCommand);
	context.subscriptions.push(indexCurrentCommand);


	await client.start();

}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	let ret = client.stop();
	return ret;
}