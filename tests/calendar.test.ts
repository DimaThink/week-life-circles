import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Calendar, formatYMD } from "../src/calendar";

const fx = JSON.parse(
  readFileSync(new URL("./fixtures/calendar.json", import.meta.url), "utf8"),
);

const user = new Calendar({ birthYear: 2000, birthMonth: 1, birthDay: 1, startAge: 21, endAge: 100 });

const ymdToDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

describe("timezone pin", () => {
  it("runs in UTC", () => {
    expect(new Date(2020, 0, 1).getTimezoneOffset()).toBe(0);
  });
});

describe("Calendar vs pinned fixtures (user config)", () => {
  it("personalToDate", () => {
    for (const { input, output } of fx.personalToDate)
      expect(formatYMD(user.personalToDate(input.yy, input.doy))).toBe(output);
  });
  it("personalYearDays", () => {
    for (const { input, output } of fx.personalYearDays)
      expect(user.personalYearDays(input.yy)).toBe(output);
  });
  it("weekStartDate", () => {
    for (const { input, output } of fx.weekStartDate)
      expect(user.weekStartDate(input.yy, input.ww)).toBe(output);
  });
  it("dateToPersonal", () => {
    for (const { input, output } of fx.dateToPersonal)
      expect(user.dateToPersonal(input.y, input.m, input.d)).toEqual(output);
  });
  it("personalYearWeek", () => {
    for (const { input, output } of fx.currentPersonalYearWeek)
      expect(user.personalYearWeek(ymdToDate(input.now))).toEqual(output);
  });
});

describe("Calendar generalization (birth 2000-01-01, ages 0-90)", () => {
  const c = new Calendar({ birthYear: 2000, birthMonth: 1, birthDay: 1, startAge: 0, endAge: 90 });

  it("personalToDate", () => {
    expect(formatYMD(c.personalToDate(0, 1))).toBe("2000-01-01");
    expect(formatYMD(c.personalToDate(0, 366))).toBe("2000-12-31");
    expect(formatYMD(c.personalToDate(1, 1))).toBe("2001-01-01");
    expect(formatYMD(c.personalToDate(90, 1))).toBe("2090-01-01");
  });
  it("personalYearDays (2000 and 2004 leap, 2100 not)", () => {
    expect(c.personalYearDays(0)).toBe(366);
    expect(c.personalYearDays(1)).toBe(365);
    expect(c.personalYearDays(4)).toBe(366);
    expect(c.personalYearDays(99)).toBe(365);
  });
  it("dateToPersonal", () => {
    expect(c.dateToPersonal(2000, 1, 1)).toEqual({ yy: 0, doy: 1 });
    expect(c.dateToPersonal(2000, 12, 31)).toEqual({ yy: 0, doy: 366 });
    expect(c.dateToPersonal(2001, 1, 1)).toEqual({ yy: 1, doy: 1 });
    expect(c.dateToPersonal(2090, 1, 1)).toEqual({ yy: 90, doy: 1 });
  });
  it("dateToPersonal before startAge -> null", () => {
    expect(c.dateToPersonal(1999, 12, 31)).toBeNull();
    expect(user.dateToPersonal(2020, 12, 31)).toBeNull();
    const late = new Calendar({ birthYear: 2000, birthMonth: 1, birthDay: 1, startAge: 5, endAge: 90 });
    expect(late.dateToPersonal(2004, 12, 31)).toBeNull();
    expect(late.dateToPersonal(2005, 1, 1)).toEqual({ yy: 5, doy: 1 });
  });
  it("weekStartDate", () => {
    expect(c.weekStartDate(0, 1)).toBe("01.01.2000");
    expect(c.weekStartDate(0, 2)).toBe("08.01.2000");
    expect(c.weekStartDate(0, 52)).toBe("23.12.2000");
    expect(c.weekStartDate(1, 1)).toBe("01.01.2001");
  });
  it("personalYearWeek", () => {
    expect(c.personalYearWeek(new Date(2000, 0, 1, 12))).toEqual({ yy: 0, ww: 1 });
    expect(c.personalYearWeek(new Date(2000, 0, 8, 12))).toEqual({ yy: 0, ww: 2 });
    expect(c.personalYearWeek(new Date(2000, 11, 31, 12))).toEqual({ yy: 0, ww: 52 }); // clamped from 53
    expect(c.personalYearWeek(new Date(1990, 5, 1, 12))).toEqual({ yy: 0, ww: 1 }); // before start -> fallback
  });
});

describe("formatYMD", () => {
  it("zero-pads", () => {
    expect(formatYMD(new Date(2005, 2, 7))).toBe("2005-03-07");
  });
});
