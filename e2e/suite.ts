import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import type { SnaplineApi } from '../src/extension';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function run(): Promise<void> {
  const api = await vscode.extensions.getExtension<SnaplineApi>('branchline.snapline')!.activate();
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'a.ts'));
  const editor = await vscode.window.showTextDocument(doc);
  editor.selection = new vscode.Selection(0, 0, 2, 1);
  await vscode.env.clipboard.writeText('probe');
  await vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
  console.log(`E2E: after copy-with-highlighting, clipboard text = ${JSON.stringify((await vscode.env.clipboard.readText()).slice(0, 30))}`);
  await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
  console.log(`E2E: after plain copy, clipboard text = ${JSON.stringify((await vscode.env.clipboard.readText()).slice(0, 30))}`);
  await vscode.env.clipboard.writeText('user clipboard');

  await vscode.commands.executeCommand('snapline.snap');
  for (let i = 0; i < 30 && !api.lastPaste(); i++) await sleep(200);
  await sleep(800);

  assert.ok(api.lastPaste(), 'webview received the code');
  console.log(`E2E: paste highlighted = ${api.lastPaste()!.highlighted}`);
  assert.equal(await vscode.env.clipboard.readText(), 'user clipboard', "user's clipboard is restored");
  const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs).map(t => t.label);
  assert.ok(tabs.includes('Snapline'), `panel open (tabs: ${tabs})`);
  console.log('E2E: all checks passed');
}
