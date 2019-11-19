'use strict';
import { GitCommit, GitRemote } from '../git/gitService';
import { Command, command, Commands } from './common';
import { Container } from '../container';

export interface EnablePullRequestsCommandArgs {
	remote: string;
	repoPath: string;
}

@command()
export class EnablePullRequestsCommand extends Command {
	static getMarkdownCommandArgs(args: EnablePullRequestsCommandArgs): string;
	static getMarkdownCommandArgs(remote: GitRemote): string;
	static getMarkdownCommandArgs(argsOrRemote: EnablePullRequestsCommandArgs | GitRemote): string {
		let args: EnablePullRequestsCommandArgs | GitCommit;
		if (GitRemote.is(argsOrRemote)) {
			args = {
				remote: argsOrRemote.id,
				repoPath: argsOrRemote.repoPath
			};
		} else {
			args = argsOrRemote;
		}

		return super.getMarkdownCommandArgsCore<EnablePullRequestsCommandArgs>(Commands.EnablePullRequests, args);
	}

	constructor() {
		super(Commands.EnablePullRequests);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async execute(args?: EnablePullRequestsCommandArgs): Promise<any> {
		if (args?.repoPath == null || args?.remote == null) return undefined;

		const remote = (await Container.git.getRemotes(args.repoPath)).find(r => args.remote);
		if (remote == null) return undefined;

		return remote.provider?.enablePullRequests?.();
	}
}
