'use strict';
import {
	DiffWithCommand,
	EnablePullRequestsCommand,
	InviteToLiveShareCommand,
	OpenCommitInRemoteCommand,
	OpenFileRevisionCommand,
	ShowQuickCommitDetailsCommand,
	ShowQuickCommitFileDetailsCommand
} from '../../commands';
import { DateStyle, FileAnnotationType } from '../../configuration';
import { GlyphChars } from '../../constants';
import { Container } from '../../container';
import { GitCommit, GitLogCommit, GitRemote, GitService, GitUri, PullRequest } from '../gitService';
import { Strings } from '../../system';
import { FormatOptions, Formatter } from './formatter';
import { ContactPresence } from '../../vsls/vsls';
import { getPresenceDataUri } from '../../avatars';
import { emojify } from '../../emojis';

const emptyStr = '';

const hasTokenRegexMap = new Map<string, RegExp>();

export interface CommitFormatOptions extends FormatOptions {
	annotationType?: FileAnnotationType;
	dateStyle?: DateStyle;
	enablePRSupportOnRemote?: GitRemote;
	getBranchAndTagTips?: (sha: string) => string | undefined;
	line?: number;
	markdown?: boolean;
	pr?: PullRequest;
	presence?: ContactPresence;
	previousLineDiffUris?: { current: GitUri; previous: GitUri | undefined };
	remotes?: GitRemote[];
	truncateMessageAtNewLine?: boolean;

	tokenOptions?: {
		ago?: Strings.TokenOptions;
		agoOrDate?: Strings.TokenOptions;
		author?: Strings.TokenOptions;
		authorAgo?: Strings.TokenOptions;
		authorAgoOrDate?: Strings.TokenOptions;
		authorDate?: Strings.TokenOptions;
		changes?: Strings.TokenOptions;
		changesShort?: Strings.TokenOptions;
		committerAgo?: Strings.TokenOptions;
		committerAgoOrDate?: Strings.TokenOptions;
		committerDate?: Strings.TokenOptions;
		date?: Strings.TokenOptions;
		email?: Strings.TokenOptions;
		id?: Strings.TokenOptions;
		message?: Strings.TokenOptions;
		pullRequest?: Strings.TokenOptions;
		pullRequestAgo?: Strings.TokenOptions;
		pullRequestAgoOrDate?: Strings.TokenOptions;
		pullRequestDate?: Strings.TokenOptions;
		pullRequestState?: Strings.TokenOptions;
		tips?: Strings.TokenOptions;
	};
}

export class CommitFormatter extends Formatter<GitCommit, CommitFormatOptions> {
	private get _authorDate() {
		return this._item.formatAuthorDate(this._options.dateFormat);
	}

	private get _authorDateAgo() {
		return this._item.formatAuthorDateFromNow();
	}

	private get _authorDateOrAgo() {
		const dateStyle =
			this._options.dateStyle !== undefined ? this._options.dateStyle : Container.config.defaultDateStyle;
		return dateStyle === DateStyle.Absolute ? this._authorDate : this._authorDateAgo;
	}

	private get _committerDate() {
		return this._item.formatCommitterDate(this._options.dateFormat);
	}

	private get _committerDateAgo() {
		return this._item.formatCommitterDateFromNow();
	}

	private get _committerDateOrAgo() {
		const dateStyle =
			this._options.dateStyle !== undefined ? this._options.dateStyle : Container.config.defaultDateStyle;
		return dateStyle === DateStyle.Absolute ? this._committerDate : this._committerDateAgo;
	}

	private get _date() {
		return this._item.formatDate(this._options.dateFormat);
	}

	private get _dateAgo() {
		return this._item.formatDateFromNow();
	}

	private get _dateOrAgo() {
		const dateStyle =
			this._options.dateStyle !== undefined ? this._options.dateStyle : Container.config.defaultDateStyle;
		return dateStyle === DateStyle.Absolute ? this._date : this._dateAgo;
	}

	private get _pullRequestDate() {
		return this._options.pr?.formatDate(this._options.dateFormat) ?? emptyStr;
	}

	private get _pullRequestDateAgo() {
		return this._options.pr?.formatDateFromNow() ?? emptyStr;
	}

	private get _pullRequestDateOrAgo() {
		const dateStyle =
			this._options.dateStyle !== undefined ? this._options.dateStyle : Container.config.defaultDateStyle;
		return dateStyle === DateStyle.Absolute ? this._pullRequestDate : this._pullRequestDateAgo;
	}

	get ago() {
		return this._padOrTruncate(this._dateAgo, this._options.tokenOptions.ago);
	}

	get agoOrDate() {
		return this._padOrTruncate(this._dateOrAgo, this._options.tokenOptions.agoOrDate);
	}

	get author() {
		const author = this._padOrTruncate(this._item.author, this._options.tokenOptions.author);
		if (!this._options.markdown) {
			return author;
		}

		return `[${author}](mailto:${this._item.email} "Email ${this._item.author} (${this._item.email})")`;
	}

	get authorAgo() {
		return this._padOrTruncate(this._authorDateAgo, this._options.tokenOptions.authorAgo);
	}

	get authorAgoOrDate() {
		return this._padOrTruncate(this._authorDateOrAgo, this._options.tokenOptions.authorAgoOrDate);
	}

	get authorDate() {
		return this._padOrTruncate(this._authorDate, this._options.tokenOptions.authorDate);
	}

	get avatar() {
		if (!this._options.markdown || !Container.config.hovers.avatars) {
			return emptyStr;
		}

		const presence = this._options.presence;
		if (presence != null) {
			const title = `${this._item.author} ${this._item.author === 'You' ? 'are' : 'is'} ${
				presence.status === 'dnd' ? 'in ' : emptyStr
			}${presence.statusText.toLocaleLowerCase()}`;

			return `${this._getGravatarMarkdown(title)}${this._getPresenceMarkdown(presence, title)}`;
		}

		return this._getGravatarMarkdown(this._item.author);
	}

	private _getGravatarMarkdown(title: string) {
		return `![${title}](${this._item
			.getGravatarUri(Container.config.defaultGravatarsStyle)
			.toString(true)}|width=16,height=16 "${title}")`;
	}

	private _getPresenceMarkdown(presence: ContactPresence, title: string) {
		return `![${title}](${getPresenceDataUri(presence.status)} "${title}")`;
	}

	get changes() {
		return this._padOrTruncate(
			GitLogCommit.is(this._item) ? this._item.getFormattedDiffStatus() : emptyStr,
			this._options.tokenOptions.changes
		);
	}

	get changesShort() {
		return this._padOrTruncate(
			GitLogCommit.is(this._item)
				? this._item.getFormattedDiffStatus({ compact: true, separator: emptyStr })
				: emptyStr,
			this._options.tokenOptions.changesShort
		);
	}

	get commands() {
		if (!this._options.markdown) return emptyStr;

		let commands;
		if (this._item.isUncommitted) {
			const { previousLineDiffUris: diffUris } = this._options;
			if (diffUris !== undefined && diffUris.previous !== undefined) {
				commands = `\`${this._padOrTruncate(
					GitService.shortenSha(
						GitService.isUncommittedStaged(diffUris.current.sha)
							? diffUris.current.sha
							: GitService.uncommittedSha
					)!,
					this._options.tokenOptions.id
				)}\``;

				commands += ` **[\`${GlyphChars.MuchLessThan}\`](${DiffWithCommand.getMarkdownCommandArgs({
					lhs: {
						sha: diffUris.previous.sha || emptyStr,
						uri: diffUris.previous.documentUri()
					},
					rhs: {
						sha: diffUris.current.sha || emptyStr,
						uri: diffUris.current.documentUri()
					},
					repoPath: this._item.repoPath,
					line: this._options.line
				})} "Open Changes")** `;
			} else {
				commands = `\`${this._padOrTruncate(
					GitService.shortenSha(
						this._item.isUncommittedStaged ? GitService.uncommittedStagedSha : GitService.uncommittedSha
					)!,
					this._options.tokenOptions.id
				)}\``;
			}

			return commands;
		}

		commands = `[\`${this.id}\`](${ShowQuickCommitDetailsCommand.getMarkdownCommandArgs(
			this._item.sha
		)} "Show Commit Details") `;

		const { pr } = this._options;
		if (pr != null) {
			commands += `[\`PR #${pr.number}\`](${pr.url} "Open Pull Request\n\\#${pr.number}\n${pr.title}\n${
				pr.state
			}, ${pr.formatDateFromNow()}") `;
		} else {
			const { enablePRSupportOnRemote } = this._options;
			if (enablePRSupportOnRemote != null) {
				commands += `[\`PR # <click to enable>\`](${EnablePullRequestsCommand.getMarkdownCommandArgs(
					enablePRSupportOnRemote
				)} "Enables the display of the Pull Request (if any) that introduced this commit") `;
			}
		}

		commands += `**[\`${GlyphChars.MuchLessThan}\`](${DiffWithCommand.getMarkdownCommandArgs(
			this._item,
			this._options.line
		)} "Open Changes")** `;

		if (this._item.previousSha !== undefined) {
			let annotationType = this._options.annotationType;
			if (annotationType === FileAnnotationType.RecentChanges) {
				annotationType = FileAnnotationType.Blame;
			}

			const uri = GitUri.toRevisionUri(
				this._item.previousSha,
				this._item.previousUri.fsPath,
				this._item.repoPath
			);
			commands += `**[\` ${GlyphChars.EqualsTriple} \`](${OpenFileRevisionCommand.getMarkdownCommandArgs(
				uri,
				annotationType || FileAnnotationType.Blame,
				this._options.line
			)} "Blame Previous Revision")** `;
		}

		if (this._options.remotes !== undefined && this._options.remotes.length !== 0) {
			commands += `**[\` ${GlyphChars.ArrowUpRight} \`](${OpenCommitInRemoteCommand.getMarkdownCommandArgs(
				this._item.sha
			)} "Open on Remote")** `;
		}

		if (this._item.author !== 'You') {
			const presence = this._options.presence;
			if (presence != null) {
				commands += `[\` ${GlyphChars.Envelope}+ \`](${InviteToLiveShareCommand.getMarkdownCommandArgs(
					this._item.email
				)} "Invite ${this._item.author} (${presence.statusText}) to a Live Share Session") `;
			}
		}

		commands += `[\`${GlyphChars.MiddleEllipsis}\`](${ShowQuickCommitFileDetailsCommand.getMarkdownCommandArgs({
			revisionUri: GitUri.toRevisionUri(this._item.toGitUri()).toString(true)
		})} "Show More Actions")`;

		return commands;
	}

	get committerAgo() {
		return this._padOrTruncate(this._committerDateAgo, this._options.tokenOptions.committerAgo);
	}

	get committerAgoOrDate() {
		return this._padOrTruncate(this._committerDateOrAgo, this._options.tokenOptions.committerAgoOrDate);
	}

	get committerDate() {
		return this._padOrTruncate(this._committerDate, this._options.tokenOptions.committerDate);
	}

	get date() {
		return this._padOrTruncate(this._date, this._options.tokenOptions.date);
	}

	get email() {
		return this._padOrTruncate(this._item.email || emptyStr, this._options.tokenOptions.email);
	}

	get id() {
		return this._padOrTruncate(this._item.shortSha || emptyStr, this._options.tokenOptions.id);
	}

	get message() {
		let message: string;
		if (this._item.isUncommitted) {
			if (
				this._item.isUncommittedStaged ||
				(this._options.previousLineDiffUris !== undefined &&
					this._options.previousLineDiffUris.current.isUncommittedStaged)
			) {
				message = 'Staged changes';
			} else {
				message = 'Uncommitted changes';
			}
		} else {
			if (this._options.truncateMessageAtNewLine) {
				const index = this._item.message.indexOf('\n');
				message =
					index === -1
						? this._item.message
						: `${this._item.message.substring(0, index)}${GlyphChars.Space}${GlyphChars.Ellipsis}`;
			} else {
				message = this._item.message;
			}

			message = emojify(message);
		}

		message = this._padOrTruncate(message, this._options.tokenOptions.message);

		if (!this._options.markdown) {
			return message;
		}

		message = Container.autolinks.linkify(Strings.escapeMarkdown(message, { quoted: true }), this._options.remotes);

		return `\n> ${message}`;
	}

	get pullRequest() {
		const { pr } = this._options;
		if (pr == null) return emptyStr;

		return this._padOrTruncate(
			this._options.markdown
				? `[PR #${pr.number}](${pr.url} "${pr.title}\n${pr.state}, ${pr.formatDateFromNow()}")`
				: `PR #${pr.number}`,
			this._options.tokenOptions.pullRequest
		);
	}

	get pullRequestAgo() {
		return this._padOrTruncate(this._pullRequestDateAgo, this._options.tokenOptions.pullRequestAgo);
	}

	get pullRequestAgoOrDate() {
		return this._padOrTruncate(this._pullRequestDateOrAgo, this._options.tokenOptions.pullRequestAgoOrDate);
	}

	get pullRequestDate() {
		return this._padOrTruncate(this._pullRequestDate, this._options.tokenOptions.pullRequestDate);
	}

	get pullRequestState() {
		return this._padOrTruncate(this._options.pr?.state ?? emptyStr, this._options.tokenOptions.pullRequestState);
	}

	get sha() {
		return this.id;
	}

	get tips() {
		const branchAndTagTips = this._options.getBranchAndTagTips && this._options.getBranchAndTagTips(this._item.sha);
		if (branchAndTagTips === undefined) return emptyStr;

		return this._padOrTruncate(branchAndTagTips, this._options.tokenOptions.tips);
	}

	static fromTemplate(template: string, commit: GitCommit, dateFormat: string | null): string;
	static fromTemplate(template: string, commit: GitCommit, options?: CommitFormatOptions): string;
	static fromTemplate(
		template: string,
		commit: GitCommit,
		dateFormatOrOptions?: string | null | CommitFormatOptions
	): string;
	static fromTemplate(
		template: string,
		commit: GitCommit,
		dateFormatOrOptions?: string | null | CommitFormatOptions
	): string {
		return super.fromTemplateCore(this, template, commit, dateFormatOrOptions);
	}

	static has(format: string, token: string) {
		let regex = hasTokenRegexMap.get(token);
		if (regex === undefined) {
			regex = new RegExp(`\\b${token}\\b`);
			hasTokenRegexMap.set(token, regex);
		}

		return regex.test(format);
	}
}
