import * as vscode from 'vscode';
import { License } from './license';
import { BUY_URL } from './licenseVerify';

const FIRST_USE = 'snapline.firstUse';
const USES = 'snapline.uses';
const DONE = 'snapline.nudgeDone';
const MIN_DAYS = 7;
const MIN_USES = 5;

/** Review page for the store this editor installs from (Open VSX for Cursor, Windsurf, VSCodium, …). */
function reviewUrl(): string {
  return /visual studio code/i.test(vscode.env.appName)
    ? 'https://marketplace.visualstudio.com/items?itemName=branchline.snapline-code-screenshots&ssr=false#review-details'
    : 'https://open-vsx.org/extension/branchline/snapline-code-screenshots/reviews';
}

/**
 * Called on each real use. After a week of use, asks once for a rating
 * (and mentions Pro to free users). Never shown again after any answer.
 */
export async function recordUse(context: vscode.ExtensionContext, license: License): Promise<void> {
  const state = context.globalState;
  if (state.get(DONE)) return;
  const now = Date.now();
  const first = state.get<number>(FIRST_USE) ?? (await state.update(FIRST_USE, now), now);
  const uses = state.get<number>(USES, 0) + 1;
  await state.update(USES, uses);
  if (uses < MIN_USES || now - first < MIN_DAYS * 86_400_000) return;

  await state.update(DONE, true);
  const actions = license.isPro ? ['Rate Snapline', 'No Thanks'] : ['Rate Snapline', 'Get Pro', 'No Thanks'];
  const pick = await vscode.window.showInformationMessage(
    'Enjoying Snapline? A quick rating helps other developers find it.',
    ...actions,
  );
  if (pick === 'Rate Snapline') void vscode.env.openExternal(vscode.Uri.parse(reviewUrl()));
  if (pick === 'Get Pro') void vscode.env.openExternal(vscode.Uri.parse(BUY_URL));
}
