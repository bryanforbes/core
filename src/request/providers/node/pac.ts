import { runInNewContext } from 'vm';
import { lookup as lookupAsync } from 'dns';
import Promise from '@dojo/shim/Promise';
import DateObject, { DateProperties } from '../../../DateObject';
import Fiber = require('fibers');
import { Netmask } from 'netmask';
import { address } from 'ip';

/**
 * Wraps `dns.lookup` for use in a Fiber so it works synchronously
 * inside a PAC script.
 */
function lookup(hostname: string, family: number = 4): void {
	const fiber = Fiber.current;
	lookupAsync(hostname, family, (err, address) => {
		if (err) {
			// Notify of the error
			(fiber as any).throwInto(err);
		} else {
			// Resume execution
			fiber.run(address as any);
		}
	});

	// Tell the Fiber to pause execution
	(Fiber as any).yield();
}

const dotRegExp = /\./g;

function isPlainHostName(host: string): boolean {
	return !(dotRegExp.test(host));
}

function dnsDomainIs(host: string, domain: string): boolean {
	domain = String(domain);
	return String(host).substr(domain.length * -1) === domain;
}

function localHostOrDomainIs(host: string, hostdom: string): boolean {
	if (!isPlainHostName(host)) {
		return host === hostdom;
	}
	return host === String(hostdom).split('.')[0];
}

function isResolvable(host: string): boolean {
	try {
		lookup(host);
	}
	catch (_) {
		return false;
	}
	return true;
}

function isInNet(host: string, pattern: string, mask: string): boolean {
	const ip = lookup(host) || '127.0.0.1';
	const netmask = new Netmask(pattern, mask);
	return Boolean(netmask.contains(ip));
}

function dnsResolve(host: string): string {
	return lookup(host) || '127.0.0.1';
}

function myIpAddress(): string {
	return address();
}

function dnsDomainLevels(host: string): number {
	const match = String(host).match(dotRegExp);
	if (!match) {
		return 0;
	}
	return match.length;
}

function shExpMatch(str: string, shexp: string): boolean {
	shexp = String(shexp)
		.replace(/\?/g, '.')
		.replace(/\*/g, '(:?.*)');
	return new RegExp(`^${shexp}$`).test(str);
}

type Weekday = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

const dayMap: { [key: string]: number } = {
	SUN: 0,
	MON: 1,
	TUE: 2,
	WED: 3,
	THU: 4,
	FRI: 5,
	SAT: 6
};

function weekdayRange(weekDay1: Weekday, gmt?: 'GMT'): boolean;
function weekdayRange(weekDay1: Weekday, weekDay2: Weekday, gmt?: 'GMT'): boolean;
function weekdayRange(weekDay1: Weekday, weekDay2: string = '', gmt?: 'GMT'): boolean {
	let wd1 = dayMap[weekDay1] || -1;
	let wd2 = dayMap[weekDay2] || -1;
	let useUTC = weekDay2 === 'GMT' || gmt === 'GMT';
	let now = DateObject.now();
	let today: number = (useUTC ? now.utc : now).dayOfWeek;

	if (wd2 === -1) {
		return wd1 === today;
	}
	else {
		if (wd1 <= wd2) {
			return weekdayInRange(today, wd1, wd2);
		}
		else {
			return weekdayInRange(today, wd1, 6) || weekdayInRange(today, 0, wd2);
		}
	}
}

function weekdayInRange(today: number, start: number, end: number): boolean {
	return today >= start && today <= end;
}

type Month = 'JAN' | 'FEB' | 'MAR' | 'APR' | 'MAY' | 'JUN' | 'JUL' | 'AUG' | 'SEP' | 'OCT' | 'NOV' | 'DEC';

/*const monthMap: { [key: string]: number; } = {
	JAN: 1,
	FEB: 2,
	MAR: 3,
	APR: 4,
	MAY: 5,
	JUN: 6,
	JUL: 7,
	AUG: 8,
	SEP: 9,
	OCT: 10,
	NOV: 11,
	DEC: 12
};*/

function dateRange(dayOrYear: number, gmt?: 'GMT'): boolean;
function dateRange(dayOrYear1: number, dayOrYear2: number, gmt?: 'GMT'): boolean;
function dateRange(mon: Month, gmt?: 'GMT'): boolean;
function dateRange(mon1: Month, mon2: Month, gmt?: 'GMT'): boolean;
function dateRange(day1: number, mon1: Month, day2: number, mon2: Month, gmt?: 'GMT'): boolean;
function dateRange(mon1: Month, year1: number, mon2: Month, year2: number, gmt?: 'GMT'): boolean;
function dateRange(day1: number, mon1: Month, year1: number, day2: number, mon2: Month, year2: number, gmt?: 'GMT'): boolean;
function dateRange(...args: any[]): boolean {
	let useUTC = false;
	if (args[args.length - 1] === 'GMT') {
		args.pop();
		useUTC = true;
	}

	return false;
}

function timeRange(hour: number, gmt?: 'GMT'): boolean;
function timeRange(hour1: number, hour2: number, gmt?: 'GMT'): boolean;
function timeRange(hour1: number, min1: number, hour2: number, min2: number, gmt?: 'GMT'): boolean;
function timeRange(hour1: number, min1: number, sec1: number, hour2: number, min2: number, sec2: number, gmt?: 'GMT'): boolean;
function timeRange(...args: any[]): boolean {
	let useUTC = false;
	if (args[args.length - 1] === 'GMT') {
		args.pop();
		useUTC = true;
	}

	let now: DateProperties = useUTC ? DateObject.now() : DateObject.now().utc;
	let integers = args.map(arg => parseInt(arg, 10));

	if (args.length === 1) {
		return now.hours === integers[0];
	}
	else if (args.length === 2) {
		return integers[0] <= now.hours && now.hours < integers[1];
	}
	else if (args.length === 4) {
		let seconds = getSeconds(now.hours, now.minutes, 0);

		return getSeconds(integers[0], integers[1], 0) <= seconds &&
			seconds <= getSeconds(integers[2], integers[3], 59);
	}
	else if (args.length === 6) {
		let seconds = getSeconds(now.hours, now.minutes, now.seconds);

		return getSeconds(integers[0], integers[1], integers[2]) <= seconds &&
			seconds <= getSeconds(integers[3], integers[4], integers[5]);
	}

	return false;
}

function getSeconds(hours: number, minutes: number, seconds: number): number {
	return (hours * 3600) + (minutes * 60) + seconds;
}

export interface FindProxyForURL {
	(url: string, host: string): Promise<string>;
}

export default function pac(content: string, fileName?: string): FindProxyForURL {
	const pacFind = new Promise<FindProxyForURL>((resolve, reject) => {
		Fiber(() => {
			try {
				const pacFind = runInNewContext(`${content};FindProxyForURL`, {
					isPlainHostName,
					dnsDomainIs,
					localHostOrDomainIs,
					isResolvable,
					isInNet,
					dnsResolve,
					myIpAddress,
					dnsDomainLevels,
					shExpMatch,
					weekdayRange,
					dateRange,
					timeRange
				}, fileName);

				if (typeof pacFind !== 'function') {
					throw new TypeError('A PAC file must declare a function named "FindProxyForURL"');
				}
			}
			catch (error) {
				reject(error);
			}
		}).run();
	});

	return function FindProxyForURL(url: string, host: string): Promise<string> {
		return pacFind.then(pacFind => {
			return new Promise<string>((resolve, reject) => {
				Fiber(() => {
					try {
						resolve(pacFind(url, host));
					}
					catch (error) {
						reject(error);
					}
				}).run();
			});
		});
	};
}
