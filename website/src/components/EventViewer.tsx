import type { SSEEvent } from "../types/sse-events";
import type { TypeInfo } from "../types/typeinfo";
import ParsedEventViewer from "./ParsedEventViewer";
import VerifierDiagnosticView from "./VerifierDiagnosticView";
import styles from "./EventViewer.module.css";
import X from "lucide-react/dist/esm/icons/x";

interface EventViewerProps {
  events: SSEEvent[];
  isRunning: boolean;
  onClear: () => void;
  typeRegistry: { [name: string]: TypeInfo };
}

export default function EventViewer({
  events,
  isRunning,
  onClear,
  typeRegistry,
}: EventViewerProps) {
  const getEventStyle = (
    event: SSEEvent
  ): "error" | "success" | "warning" | "normal" => {
    if (event.type === "compileError") return "error";
    if (event.type === "requestError") return "error";
    if (event.type === "wrongAnswer") return "error";
    if (event.type === "correctAnswer") return "success";
    if (event.type === "multipleAnswers") return "warning";
    if (event.type === "noAnswer") return "warning";
    if (event.type === "guestMessage") {
      if (event.data.type === "debugMapNotFound") return "error";
      if (event.data.type === "noProgramsFound") return "error";
      if (event.data.type === "cantAttachProgram") return "error";
      if (event.data.type === "verifierFail") return "error";
      if (event.data.type === "crashed") return "error";
    }
    return "normal";
  };

  const formatEvent = (event: SSEEvent): string => {
    if (event.type === "compileError") {
      return event.data;
    }
    if (event.type === "requestError") {
      return `请求错误：${event.data}`;
    }
    if (event.type === "correctAnswer") {
      return "答案正确！";
    }
    if (event.type === "wrongAnswer") {
      return "答案错误";
    }
    if (event.type === "multipleAnswers") {
      return "检测到多个答案";
    }
    if (event.type === "noAnswer") {
      return "你没有提交答案。用 SUBMIT_STR 或 SUBMIT_NUM 提交。";
    }
    if (event.type === "guestMessage") {
      if (event.data.type === "debugMapNotFound") {
        return "错误：程序里没有 perf map";
      }
      if (event.data.type === "noProgramsFound") {
        return "错误：代码里没有 eBPF 程序，是不是漏了 SEC() 声明？";
      }
      if (event.data.type === "cantAttachProgram") {
        const { section, kind } = event.data.data;
        if (kind === "noSuchHook") {
          return `无法挂载到 \`${section}\`，检查一下挂载点名字有没有拼错。`;
        }
        if (kind === "denied") {
          return `内核拒绝了挂载到 \`${section}\` 的程序，通常是读 ctx 时越界了。`;
        }
        return `无法挂载到 \`${section}\`。`;
      }
      if (event.data.type === "verifierFail") {
        return event.data.data;
      }
      return `${event.data.type}: ${JSON.stringify(event.data.data)}`;
    }
    return event.type;
  };

  // When a structured diagnostic is present, the raw verifierFail row is
  // redundant: the diagnostic component shows the raw log under its own tab.
  const hasDiagnostic = events.some((e) => e.type === "verifierDiagnostic");

  // If anything errored, the program never ran, so a "you didn't submit an
  // answer" warning is noise — there was no chance to submit one.
  const hasError = events.some((e) => getEventStyle(e) === "error");

  return (
    <div className={styles.eventViewer}>
      <div className={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h3>执行事件</h3>
          {isRunning && <span className={styles.loading}>加载中…</span>}
        </div>
        <button className={styles.closeButton} onClick={onClear}>
          <X></X>
        </button>
      </div>
      <div className={styles.events}>
        {events
          .filter(
            (event) => ["compiling", "booting", "stack"].indexOf(event.type) < 0
          )
          .filter(
            (event) =>
              event.type !== "guestMessage" ||
              ["booted", "foundProgram", "finished"].indexOf(event.data.type) ==
                -1
          )
          .filter(
            (event) =>
              !hasDiagnostic ||
              event.type !== "guestMessage" ||
              event.data.type !== "verifierFail"
          )
          .filter((event) => !(hasError && event.type === "noAnswer"))
          .map((event, i) => {
            if (event.type === "verifierDiagnostic") {
              return <VerifierDiagnosticView key={i} data={event.data} />;
            }
            if (event.type === "guestMessage" && event.data.type === "event") {
              return (
                <ParsedEventViewer
                  key={i}
                  data={event.data.data}
                  typeRegistry={typeRegistry}
                />
              );
            }

            const eventStyle = getEventStyle(event);
            const className =
              eventStyle === "error"
                ? styles.errorEvent
                : eventStyle === "success"
                ? styles.successEvent
                : eventStyle === "warning"
                ? styles.warningEvent
                : styles.event;

            return (
              <p key={i} className={className}>
                {formatEvent(event)}
              </p>
            );
          })}
      </div>
    </div>
  );
}
