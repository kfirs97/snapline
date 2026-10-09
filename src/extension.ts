import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { License } from './license';
import { BUY_URL } from './licenseVerify';
import { recordUse } from './nudge';
import { DEFAULT_SETTINGS, FromWebview, SnapSettings, ToWebview } from './protocol';

const SETTINGS_KEY = 'snapline.settings';
let panel: vscode.WebviewPanel | undefined;
let ready: Promise<void> | undefined;
/** Last paste result reported by the webview (exposed for tests). */
let lastPaste: { highlighted: boolean } | undefined;

export interface SnaplineApi {
  lastPaste(): { highlighted: boolean } | undefined;
}

export async function activate(context: vscode.ExtensionContext): Promise<SnaplineApi> {
  const license = new License(context, {
    product: 'Snapline',
    features: 'watermark-free snaps and custom backgrounds',
    howTo: 'Try it: select some code, right-click → Snap Code.',
  });
  context.subscriptions.push(license);
  await license.init();
  const post = (m: ToWebview) => void panel?.webview.postMessage(m);
  license.onDidChange(pro => post({ type: 'pro', pro }));

  const openPanel = (): Promise<void> => {
    if (panel && ready) {
      panel.reveal(vscode.ViewColumn.Beside, true);
      return ready;
    }
    panel = vscode.window.createWebviewPanel('snapline', 'Snapline', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    });
    panel.webview.html = html(panel.webview, context.extensionUri);
    panel.onDidDispose(() => (panel = ready = undefined));
    ready = new Promise(resolve => {
      panel!.webview.onDidReceiveMessage(async (m: FromWebview) => {
        switch (m.type) {
          case 'ready':
            post({ type: 'init', settings: { ...DEFAULT_SETTINGS, ...context.globalState.get<Partial<SnapSettings>>(SETTINGS_KEY) }, pro: license.isPro });
            return resolve();
          case 'pasted':
            lastPaste = { highlighted: m.highlighted };
            return;
          case 'settings':
            return void context.globalState.update(SETTINGS_KEY, m.settings);
          case 'save':
            return savePng(m.dataUrl);
          case 'copied':
            return void vscode.window.setStatusBarMessage('$(check) Snap copied to clipboard', 3000);
          case 'copyFallback':
            void vscode.window.showWarningMessage('Copying images isn’t supported here — save the PNG instead.', 'Save PNG').then(p => p && savePng(m.dataUrl));
            return;
          case 'getPro':
            return void license.require(m.feature);
          case 'error':
            return void vscode.window.showErrorMessage(m.message);
        }
      });
    });
    return ready;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('snapline.snap', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return void vscode.window.showInformationMessage('Open a file and select some code to snap.');
      const sel = editor.selection.isEmpty
        ? new vscode.Selection(0, 0, editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).text.length)
        : editor.selection;
      // Snap whole lines so indentation and highlighting are preserved.
      const range = new vscode.Selection(sel.start.line, 0, sel.end.line, editor.document.lineAt(sel.end.line).text.length);
      const text = editor.document.getText(range);
      if (!text.trim()) return void vscode.window.showInformationMessage('The selection is empty.');
      await openPanel();

      // Copy with syntax highlighting (the webview pastes it to get theme colors), then restore the user's clipboard.
      const previous = await vscode.env.clipboard.readText();
      const originalSelections = editor.selections;
      editor.selections = [range];
      await vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
      editor.selections = originalSelections;
      post({ type: 'code', text, fileName: editor.document.fileName.split(/[\\/]/).pop()!, startLine: range.start.line + 1, languageId: editor.document.languageId });
      setTimeout(() => void vscode.env.clipboard.writeText(previous), 600);
      void recordUse(context, license);
    }),
    vscode.commands.registerCommand('snapline.enterLicense', () => license.enterKey()),
    vscode.commands.registerCommand('snapline.removeLicense', () => license.removeKey()),
    vscode.commands.registerCommand('snapline.buyPro', () => vscode.env.openExternal(vscode.Uri.parse(BUY_URL))),
  );
  return { lastPaste: () => lastPaste };
}

async function savePng(dataUrl: string): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(require('node:os').homedir());
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(folder, `snap-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`),
    filters: { Images: ['png'] },
  });
  if (!target) return;
  await vscode.workspace.fs.writeFile(target, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const pick = await vscode.window.showInformationMessage(`Saved ${target.path.split('/').pop()}`, 'Reveal');
  if (pick) void vscode.commands.executeCommand('revealFileInOS', target);
}

function html(webview: vscode.Webview, root: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const asset = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(root, 'dist', f));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource} data:;">
<link rel="stylesheet" href="${asset('webview.css')}"><title>Snapline</title></head>
<body><script nonce="${nonce}" src="${asset('webview.js')}"></script></body></html>`;
}

export function deactivate(): void {}
