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

  it("renders the published v2 golden candidate and labels ranking correctly", () => {
    render(<App />);
    const results = screen.getByRole("region", { name: "추천 결과" });
    expect(within(results).getByText("서울 청년 주거 지원")).toBeInTheDocument();
    expect(within(results).getByText("상대 관련도 86%")).toBeInTheDocument();
    expect(within(results).queryByText(/적합도/)).not.toBeInTheDocument();
  });

  it("renders detail provenance data and only the structured official action", () => {
    render(<App />);
    const prep = screen.getByRole("region", { name: "신청 준비" });
    expect(within(prep).getByText("거주지 확인 서류")).toBeInTheDocument();
    const link = within(prep).getByRole("link", { name: /공식 페이지/ });
    expect(link).toHaveAttribute("href", "https://www.gov.kr/portal/service/example");
    expect(within(prep).queryByRole("link", { name: /검색/ })).not.toBeInTheDocument();
  });

  it("filters cards by literal display text", () => {
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "검색 조건" }), {
      target: { value: "없는 검색어" }
    });
    expect(screen.getByText("검색 조건에 맞는 결과가 없습니다.")).toBeInTheDocument();
  });

  it("shows the transparent ranking persona and fixture mode", () => {
    render(<App />);
    expect(screen.getByText(/적용 페르소나:/)).toHaveTextContent("general");
    expect(screen.getByText("Data mode: fixture")).toBeInTheDocument();
  });

  it("clarifies KST deadlines and keeps the safety notice visible", () => {
    render(<App />);
    expect(screen.getByText(/한국 시간\(KST\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/확정 자격 판정, 로그인, 본인인증, 제출 자동화를 수행하지 않습니다/)
    ).toBeInTheDocument();
  });

  it("shows source status and tool traces in transparency disclosure", () => {
    render(<App />);
    expect(screen.getByText("데이터 출처 · 동작 내역")).toBeInTheDocument();
    expect(screen.getByText("adapter 0.3.0")).toBeInTheDocument();
    expect(screen.getByText("searchBenefits")).toBeInTheDocument();
  });

  it("reports partial source failure without pretending it is a fallback", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "일부 출처 실패" }));
    expect(screen.getByText("일부 출처 응답 실패")).toBeInTheDocument();
    expect(screen.getAllByText("시간 초과").length).toBeGreaterThan(0);
    expect(screen.getByText("선택한 항목의 상세가 없습니다.")).toBeInTheDocument();
  });
});
