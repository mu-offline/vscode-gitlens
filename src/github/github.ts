'use strict';
import { ConfigurationChangeEvent, Disposable } from 'vscode';
import { graphql } from '@octokit/graphql';
import { configuration } from '../configuration';
import { Logger } from '../logger';
import { log } from '../system';
import { PullRequest } from '../git/gitService';
import { PullRequestState } from '../git/models/models';

export class GitHubApi implements Disposable {
	private readonly _disposable: Disposable;

	constructor() {
		this._disposable = Disposable.from(configuration.onDidChange(this.onConfigurationChanged, this));
		void this.onConfigurationChanged(configuration.initializingChangeEvent);
	}

	dispose() {
		this._disposable && this._disposable.dispose();
	}

	private onConfigurationChanged(e: ConfigurationChangeEvent) {
		if (configuration.changed(e, 'githubToken')) {
			this._token = undefined;
		}
	}

	private _token: string | null | undefined;
	get token() {
		if (this._token === undefined) {
			this._token = configuration.get('githubToken');
		}
		return this._token;
	}

	@log()
	async getPullRequestForCommit(owner: string, repo: string, ref: string): Promise<PullRequest | undefined> {
		const cc = Logger.getCorrelationContext();

		if (!this.token) {
			if (cc != null) {
				cc.exitDetails = 'No GitHub personal access token';
			}
			return undefined;
		}

		try {
			const query = `query pr($owner: String!, $repo: String!, $sha: String!) {
	repository(name: $repo, owner: $owner) {
		object(expression: $sha) {
			... on Commit {
				associatedPullRequests(first: 1, orderBy: {field: UPDATED_AT, direction: DESC}) {
					nodes {
						permalink
						number
						title
						state
						updatedAt
						closedAt
						mergedAt
						repository {
							owner {
								login
							}
						}
					}
				}
			}
		}
	}
}`;

			const variables = { owner: owner, repo: repo, sha: ref };
			Logger.debug(cc, `variables: ${JSON.stringify(variables)}`);

			const rsp = await graphql(query, { ...variables, headers: { authorization: `token ${this.token}` } });
			const pr = rsp?.repository?.object?.associatedPullRequests?.nodes?.[0] as GitHubPullRequest | undefined;
			if (pr == null) return undefined;
			// GitHub seems to sometimes return PRs for forks
			if (pr.repository.owner.login !== owner) return undefined;

			return new PullRequest(
				pr.number,
				pr.title,
				pr.permalink,
				pr.state === 'MERGED'
					? PullRequestState.Merged
					: pr.state === 'CLOSED'
					? PullRequestState.Closed
					: PullRequestState.Open,
				new Date(pr.updatedAt),
				pr.closedAt == null ? undefined : new Date(pr.closedAt),
				pr.mergedAt == null ? undefined : new Date(pr.mergedAt)
			);
		} catch (ex) {
			Logger.error(ex, cc);
			return undefined;
		}
	}
}

interface GitHubPullRequest {
	permalink: string;
	number: number;
	title: string;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	updatedAt: string;
	closedAt: string | null;
	mergedAt: string | null;
	repository: {
		owner: {
			login: string;
		};
	};
}
