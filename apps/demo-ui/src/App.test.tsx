import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the three primary regions", () => {
    render(<App />);

    expect(screen.getByRole("region", { name: "입력 및 조건" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "추천 결과" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "신청 준비" })).toBeInTheDocument();
  });

  it("renders benefit cards from the active scenario", () => {
    render(<App />);

    const results = screen.getByRole("region", { name: "추천 결과" });
    expect(within(results).getByText("서울 청년 월세 지원")).toBeInTheDocument();
    expect(within(results).getByText("국가장학금")).toBeInTheDocument();
  });

  it("shows the recommendation fit score on benefit cards", () => {
    render(<App />);

    expect(screen.getByText("적합도 92%")).toBeInTheDocument();
  });

  it("shows the first benefit's application prep by default", () => {
    render(<App />);

    const prep = screen.getByRole("region", { name: "신청 준비" });
    expect(within(prep).getByText("임대차계약서")).toBeInTheDocument();
  });

  it("updates the application prep in place when another card is selected", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "국가장학금" }));

    const prep = screen.getByRole("region", { name: "신청 준비" });
    expect(within(prep).getByText("재학증명서")).toBeInTheDocument();
    expect(within(prep).queryByText("임대차계약서")).not.toBeInTheDocument();
  });

  it("leads with the government search and warns when the deep link is stale", () => {
    render(<App />);

    const prep = screen.getByRole("region", { name: "신청 준비" });
    expect(within(prep).getByText(/만료되었을 수 있어/)).toBeInTheDocument();

    // primary fallback is the government (gov.kr) integrated search
    const primary = within(prep).getByRole("link", { name: /정부24 통합검색/ });
    expect(primary).toHaveAttribute("href", expect.stringContaining("gov.kr/search"));
    expect(primary).toHaveAttribute("target", "_blank");
    expect(primary).toHaveAttribute("rel", expect.stringContaining("noopener"));

    // the original (possibly expired) link is still reachable, but demoted
    expect(within(prep).getByRole("link", { name: /원본 링크/ })).toHaveAttribute(
      "href",
      "https://www.gov.kr/portal/service/serviceInfo/611000000119"
    );

    // a general web search exists only as the very last resort
    expect(within(prep).getByRole("link", { name: /웹에서 검색/ })).toHaveAttribute(
      "href",
      expect.stringContaining("search.naver.com")
    );
  });

  it("links a verified benefit straight to its official page", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "국가장학금" }));

    const prep = screen.getByRole("region", { name: "신청 준비" });
    expect(within(prep).queryByText(/만료되었을 수 있어/)).not.toBeInTheDocument();
    expect(within(prep).getByRole("link", { name: /공식 페이지/ })).toHaveAttribute(
      "href",
      "https://www.kosaf.go.kr"
    );
  });

  it("switches scenarios and resets the prep to the new top result", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "청년 구직자" }));

    const results = screen.getByRole("region", { name: "추천 결과" });
    expect(within(results).getByText("국민취업지원제도")).toBeInTheDocument();

    const prep = screen.getByRole("region", { name: "신청 준비" });
    expect(within(prep).getByText("구직활동계획서")).toBeInTheDocument();
  });

  it("filters cards by the search keyword", () => {
    render(<App />);

    fireEvent.change(screen.getByRole("textbox", { name: "검색 조건" }), {
      target: { value: "장학" }
    });

    const results = screen.getByRole("region", { name: "추천 결과" });
    expect(within(results).getByText("국가장학금")).toBeInTheDocument();
    expect(within(results).queryByText("서울 청년 월세 지원")).not.toBeInTheDocument();
  });

  it("marks the persona applied to the search in the input area", () => {
    render(<App />);

    const input = screen.getByRole("region", { name: "입력 및 조건" });
    expect(within(input).getByText(/university_student/)).toBeInTheDocument();
  });

  it("clarifies that deadlines are shown in KST", () => {
    render(<App />);

    expect(screen.getByText(/한국 시간\(KST\)/)).toBeInTheDocument();
  });

  it("keeps the safety notice visible", () => {
    render(<App />);

    expect(
      screen.getByText(/확정 자격 판정, 로그인, 본인인증, 제출 자동화를 수행하지 않습니다/)
    ).toBeInTheDocument();
  });

  it("tucks gateway transparency into a disclosure, not a main region", () => {
    render(<App />);

    expect(screen.queryByRole("region", { name: "데이터 출처" })).not.toBeInTheDocument();
    expect(screen.getByText("데이터 출처 · 동작 내역")).toBeInTheDocument();
    expect(screen.getByText("청년 월세 지원 공고")).toBeInTheDocument();
    expect(screen.getByText("searchBenefits")).toBeInTheDocument();
  });

  it("reports a partial run when a source falls back", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "청년 구직자" }));

    expect(screen.getByText("일부 출처 대체(폴백)")).toBeInTheDocument();
  });
});
