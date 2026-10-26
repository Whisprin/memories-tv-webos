export function formatDuration(durationSeconds: number): string {
	const total = Math.floor(durationSeconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;

	return hours > 0
		? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
		: `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatCount(count: number, noun: string, plural = `${noun}s`): string {
	return `${count.toLocaleString('en-US')} ${count === 1 ? noun : plural}`;
}

export function formatBucketMonth(timeBucket: string): string {
	const [year, month] = timeBucket.split('-').map(Number);
	if (!year || !month || month < 1 || month > 12) return timeBucket;
	return new Date(year, month - 1).toLocaleDateString('en-US', {month: 'short', year: 'numeric'});
}

export function formatBucketDate(timeBucket: string): string {
	const [year, month, day] = timeBucket.split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) return timeBucket;
	const date = new Date(year, month - 1, day);

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	const dateNormalized = new Date(date);
	dateNormalized.setHours(0, 0, 0, 0);

	if (dateNormalized.getTime() === today.getTime()) return 'Today';
	if (dateNormalized.getTime() === yesterday.getTime()) return 'Yesterday';

	return date.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'short', day: 'numeric'});
}

// localDateTime carries the wall-clock time in UTC fields, so it's formatted in UTC.
export function formatAssetDateTime(localDateTime: string): {date: string; time: string} {
	const date = new Date(localDateTime);
	return {
		date: date.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'}),
		time: date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'}),
	};
}
