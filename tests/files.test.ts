import { describe, it, expect } from "vitest";
import { parseWeekFilename, extractSquares, readWeekData } from "../src/weekFiles";
import { parseDayFilename, readDayData } from "../src/dayFiles";

const keys = ["work.png", "rest.png", "fun.png"];
const reader = (content: string) => async () => content;

describe("parseWeekFilename", () => {
  it("parses WW.YY.md", () => {
    expect(parseWeekFilename("04.25.md")).toEqual({ ww: 4, yy: 25 });
  });
  it("rejects non-week names", () => {
    expect(parseWeekFilename("x.md")).toBeNull();
    expect(parseWeekFilename("2026-04-30.md")).toBeNull();
  });
});

describe("extractSquares", () => {
  it("parses HTML span notation, mapping slug to key", () => {
    expect(
      extractSquares('<span class="sq sq-work"></span><span class="sq sq-rest"></span>', keys),
    ).toEqual(["work.png", "rest.png"]);
  });
  it("drops HTML spans with unknown slugs", () => {
    expect(extractSquares('<span class="sq sq-nope"></span><span class="sq sq-fun"></span>', keys)).toEqual(["fun.png"]);
  });
  it("parses backtick notation", () => {
    expect(extractSquares("`sq:work.png` `sq:rest.png`", keys)).toEqual(["work.png", "rest.png"]);
  });
  it("parses legacy wikilink notation (png and jpg, with/without size)", () => {
    expect(extractSquares("![[work.png|14]] ![[rest.jpg]]", keys)).toEqual(["work.png", "rest.jpg"]);
  });
  it("prefers HTML over backtick over legacy", () => {
    expect(extractSquares('`sq:rest.png` <span class="sq sq-work"></span> ![[fun.png]]', keys)).toEqual(["work.png"]);
    expect(extractSquares("![[fun.png]] `sq:rest.png`", keys)).toEqual(["rest.png"]);
  });
  it("returns [] when nothing matches", () => {
    expect(extractSquares("plain text", keys)).toEqual([]);
  });
});

describe("readWeekData", () => {
  it("strips frontmatter and collects squares (multi-square continuation)", async () => {
    const text = '---\ntitle: x\n---\n\n<span class="sq sq-work"></span><span class="sq sq-rest"></span>\nnext';
    const r = await readWeekData(reader(text), { name: "10.25.md" }, keys);
    expect(r.squares).toEqual(["work.png", "rest.png"]);
    expect(r.startWW).toBeNull();
    expect(r.endWW).toBeNull();
  });
  it("ignores squares inside frontmatter", async () => {
    const text = "---\nx: `sq:work.png`\n---\nnothing";
    expect((await readWeekData(reader(text), { name: "10.25.md" }, keys)).squares).toEqual([]);
  });
  it("only scans first 5 content lines", async () => {
    const text = "a\nb\nc\nd\ne\n`sq:work.png`";
    expect((await readWeekData(reader(text), { name: "10.25.md" }, keys)).squares).toEqual([]);
  });
  it("treats same-year span as week span", async () => {
    const r = await readWeekData(reader("# 4-5.24\n`sq:work.png`"), { name: "04.24.md" }, keys);
    expect(r.startWW).toBe(4);
    expect(r.endWW).toBe(5);
  });
  it("handles multi-week spans (first and last)", async () => {
    const r = await readWeekData(reader("# 16-17-18-19.25"), { name: "16.25.md" }, keys);
    expect([r.startWW, r.endWW]).toEqual([16, 19]);
  });
  it("does not treat DD-DD.MM date range as a span when year differs", async () => {
    const r = await readWeekData(reader("# 19-25.11"), { name: "47.24.md" }, keys);
    expect(r.startWW).toBeNull();
    expect(r.endWW).toBeNull();
  });
  it("19-25.11 inside a .11 file is span-shaped and matches own year (source behavior)", async () => {
    const r = await readWeekData(reader("# 19-25.11"), { name: "47.11.md" }, keys);
    expect([r.startWW, r.endWW]).toEqual([19, 25]);
  });
  it("span only looked for in first 3 content lines", async () => {
    const r = await readWeekData(reader("a\nb\nc\n4-5.24"), { name: "04.24.md" }, keys);
    expect(r.startWW).toBeNull();
  });
});

describe("parseDayFilename", () => {
  it("parses YYYY-MM-DD.md", () => {
    expect(parseDayFilename("2026-04-30.md")).toEqual({ y: 2026, m: 4, d: 30 });
  });
  it("rejects others", () => {
    expect(parseDayFilename("04.25.md")).toBeNull();
  });
});

describe("readDayData", () => {
  it("returns first square after frontmatter", async () => {
    const text = '---\na: 1\n---\n`sq:rest.png` `sq:work.png`';
    expect(await readDayData(reader(text), { name: "2026-04-30.md" }, keys)).toEqual({ square: "rest.png" });
  });
  it("returns null when none", async () => {
    expect(await readDayData(reader("hello"), { name: "2026-04-30.md" }, keys)).toEqual({ square: null });
  });
});

describe("CRLF notes", () => {
  it("skip frontmatter and find the circle in a Windows-line-ending week note", async () => {
    const text = '---\r\ntags: x\r\n---\r\n07.28 ![[work.png|14]] 18.11.2026\r\n';
    const d = await readWeekData(reader(text), { name: "07.28.md" }, keys);
    expect(d.squares).toEqual(["work.png"]);
  });
});
