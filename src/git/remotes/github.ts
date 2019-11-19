'use strict';
import { ConfigurationTarget, Range, window } from 'vscode';
import { RemoteProvider, RemoteProviderWithPullRequests } from './provider';
import { AutolinkReference } from '../../config';
import { DynamicAutolinkReference } from '../../annotations/autolinks';
import { Container } from '../../container';
import { PullRequest } from '../models/pullRequest';
import { configuration } from '../../configuration';

const issueEnricher3rdParyRegex = /\b(\w+\\?-?\w+(?!\\?-)\/\w+\\?-?\w+(?!\\?-))\\?#([0-9]+)\b/g;

export class GitHubRemote extends RemoteProvider {
	constructor(domain: string, path: string, protocol?: string, name?: string, custom: boolean = false) {
		super(domain, path, protocol, name, custom);
	}

	private _autolinks: (AutolinkReference | DynamicAutolinkReference)[] | undefined;
	get autolinks(): (AutolinkReference | DynamicAutolinkReference)[] {
		if (this._autolinks === undefined) {
			this._autolinks = [
				{
					prefix: '#',
					url: `${this.baseUrl}/issues/<num>`,
					title: 'Open Issue #<num>'
				},
				{
					prefix: 'gh-',
					url: `${this.baseUrl}/issues/<num>`,
					title: 'Open Issue #<num>',
					ignoreCase: true
				},
				{
					linkify: (text: string) =>
						text.replace(
							issueEnricher3rdParyRegex,
							`[$&](${this.protocol}://${this.domain}/$1/issues/$2 "Open Issue #$2 from $1")`
						)
				}
			];
		}
		return this._autolinks;
	}

	get icon() {
		return 'github';
	}

	get name() {
		return this.formatName('GitHub');
	}

	async enablePullRequests() {
		const token = await window.showInputBox({
			placeHolder: 'Generate a personal access token from github.com (required)',
			prompt: 'Enter a GitHub personal access token',
			validateInput: (value: string) => (value ? undefined : 'Must be a valid GitHub personal access token'),
			ignoreFocusOut: true
		});
		if (!token) return;

		await configuration.update('githubToken', token, ConfigurationTarget.Global);
	}

	private _prsByCommit = new Map<string, Promise<PullRequest | undefined>>();
	async getPullRequestForCommit(ref: string): Promise<PullRequest | undefined> {
		let pr = this._prsByCommit.get(ref);
		if (pr === undefined) {
			const [owner, repo] = this.splitPath();
			pr = (await Container.github)?.getPullRequestForCommit(owner, repo, ref);
			if (pr != null) {
				this._prsByCommit.set(ref, pr);
			}
		}
		return pr;
	}

	supportsPullRequests(): this is RemoteProviderWithPullRequests {
		return Container.config.githubToken != null;
	}

	protected getUrlForBranches(): string {
		return `${this.baseUrl}/branches`;
	}

	protected getUrlForBranch(branch: string): string {
		return `${this.baseUrl}/commits/${branch}`;
	}

	protected getUrlForCommit(sha: string): string {
		return `${this.baseUrl}/commit/${sha}`;
	}

	protected getUrlForFile(fileName: string, branch?: string, sha?: string, range?: Range): string {
		let line;
		if (range) {
			if (range.start.line === range.end.line) {
				line = `#L${range.start.line}`;
			} else {
				line = `#L${range.start.line}-L${range.end.line}`;
			}
		} else {
			line = '';
		}

		if (sha) return `${this.baseUrl}/blob/${sha}/${fileName}${line}`;
		if (branch) return `${this.baseUrl}/blob/${branch}/${fileName}${line}`;
		return `${this.baseUrl}?path=${fileName}${line}`;
	}
}
