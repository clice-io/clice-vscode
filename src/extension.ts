import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import { workspace, window, ExtensionContext, OutputChannel } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, Trace, StreamInfo, TextDocumentIdentifier } from 'vscode-languageclient/node';

import { highlightDocument } from './feature/SemanticHighlight';
import { HeaderContext, HeaderContextProvider, TreeItem, IncludeLocation, HeaderContextSwitchParams } from './feature/HeaderContexts';

let client: LanguageClient;
let provider: HeaderContextProvider | undefined = undefined;

class TextDocumentParams {
	constructor(public textDocument: TextDocumentIdentifier) { }
};

export function actionFile() {
	return new TextDocumentParams({ uri: window.activeTextEditor!.document.uri.toString() });
}

export async function registerCommands(client: LanguageClient, context: ExtensionContext) {	// Register the IndexAll command
	const indexAllCommand = vscode.commands.registerCommand('clice.indexAll', async () => {
		try {
			await client.sendNotification('index/all');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to send index/all: ${error}`);
		}
	});

	const indexCurrentCommand = vscode.commands.registerCommand('clice.indexCurrent', async () => {
		try {
			await client.sendNotification("index/current", { uri: window.activeTextEditor?.document.uri.toString() });
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to send index/current: ${error}`);
		}
	});

	vscode.commands.registerCommand("clice.currentContext", async () => {
		let context: HeaderContext = await client.sendRequest("context/current", actionFile());
		provider!.header = window.activeTextEditor!.document.uri.toString();
		provider?.update([[context]]);
	})

	vscode.commands.registerCommand("clice.allContexts", async () => {
		let contexts = await client.sendRequest("context/all", actionFile());
		provider!.header = window.activeTextEditor!.document.uri.toString();
		provider?.update(contexts as Array<Array<HeaderContext>>);
	})

	vscode.commands.registerCommand("clice.switchContext", async (item: TreeItem) => {
		let params: HeaderContextSwitchParams = {
			"header": provider!.header,
			"context": item!.context!
		}

		await client.sendRequest("context/switch", params);
	})

	vscode.commands.registerCommand("clice.resolveContext", async (item: TreeItem) => {
		let includes: Array<IncludeLocation> = await client.sendRequest("context/resolve", item!.context);
		item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		item.children = includes.map((location: IncludeLocation) => {
			const uri = vscode.Uri.file(location.filename);

			let item = new TreeItem(uri, vscode.TreeItemCollapsibleState.None);
			item.command = {
				"title": "Open File",
				"command": "vscode.open",
				"arguments": [uri, { "selection": new vscode.Range(location.line, 0, location.line + 1, 0) } as vscode.TextDocumentShowOptions]
			}
			return item;
		});

		provider!.refresh();
	})

	// Add the command to the context subscriptions
	context.subscriptions.push(indexAllCommand);
	context.subscriptions.push(indexCurrentCommand);
}

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

	provider = new HeaderContextProvider();
	let treeView = vscode.window.createTreeView("header-contexts", { treeDataProvider: provider });

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