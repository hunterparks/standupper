// Shared types for Standupper application

export type AccentColor = 'green' | 'red' | 'blue' | 'yellow' | 'purple';

export const ACCENT_COLORS: AccentColor[] = ['green', 'red', 'blue', 'yellow', 'purple'];

/**
 * Site theme (paper, ink, background, decorations). Independent of the
 * accent color. "automatic" follows the calendar; see resolveTheme().
 */
export type ThemeChoice =
	| 'automatic'
	| 'standard'
	| 'new-year'
	| 'valentines'
	| 'st-patricks'
	| 'spring'
	| 'cinco-de-mayo'
	| 'usa'
	| 'summer'
	| 'halloween'
	| 'day-of-the-dead'
	| 'autumn'
	| 'thanksgiving'
	| 'winter';

/** Every theme choice, in calendar order (this is the picker order). */
export const THEME_CHOICES: ThemeChoice[] = [
	'automatic',
	'standard',
	'new-year',
	'valentines',
	'st-patricks',
	'spring',
	'cinco-de-mayo',
	'usa',
	'summer',
	'halloween',
	'day-of-the-dead',
	'autumn',
	'thanksgiving',
	'winter'
];

/** A theme that can actually be rendered (i.e. not "automatic"). */
export type ResolvedTheme = Exclude<ThemeChoice, 'automatic'>;

export interface Standup {
	id: string; // UUID v4
	name: string;
	last_login: string; // ISO date string
	timer_duration_minutes: number; // 0 means no time limit (indeterminate progress bar)
	color: AccentColor;
	theme: ThemeChoice;
}

export interface User {
	id: number; // Auto-incrementing integer
	name: string;
	standup_id: string; // Foreign key to standup.id
	inactive: boolean; // Default: false
	starred: boolean; // Default: false. At most one starred user per standup; the starred user delivers the joke on the completion page.
}

export interface CreateStandupRequest {
	name: string;
}

export interface CreateUserRequest {
	name: string;
	standup_id: string;
}

export interface UpdateUserRequest {
	name?: string;
	inactive?: boolean;
	starred?: boolean;
}

export interface BulkUpdateInactiveRequest {
	mode: 'all' | 'none' | 'invert';
}

export interface UpdateStandupRequest {
	timer_duration_minutes?: number;
	color?: AccentColor;
	theme?: ThemeChoice;
}

export interface StandupSession {
	standup: Standup;
	users: User[];
}
