import { useEffect, useRef, useState } from "react";
import { TccWorkerClient } from "../lib/tcc-worker-client";
import { runCode } from "../lib/api-client";
import { debTypeRegistry } from "../lib/deb-type-registry";
import CodeEditor from "./CodeEditor";
import CompilerOutput from "./CompilerOutput";
import RunButton from "./RunButton";
import EventViewer from "./EventViewer";
import StructViewer from "./StructViewer";
import ControlButton from "./ControlButton";
import { Panel, Group, Separator } from "react-resizable-panels";
import type { TypeInfo } from "../types/typeinfo";
import type { DebTypeInfo } from "../types/debtypeinfo";
import type { SSEEvent } from "../types/sse-events";
import styles from "./App.module.css";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Braces from "lucide-react/dist/esm/icons/braces";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";

interface AppProps {
  starterCode: string;
  exerciseId: string;
  chapterId?: number;
  codeFile?: string;
}

export default function App({
  starterCode,
  exerciseId,
  chapterId,
  codeFile,
}: AppProps) {
  if (!exerciseId) {
    throw new Error("Missing exerciseId");
  }
  if (!starterCode) {
    throw new Error("Missing starterCode");
  }
  const DEBOUNCE_TIME_MS = 200;
  const codeStorageKey = `user-code-${exerciseId}`;

  const getInitialCode = () => {
    if (typeof window === "undefined") return starterCode;
    const savedCode = localStorage.getItem(codeStorageKey);
    return savedCode !== null ? savedCode : starterCode;
  };

  const [code, setCode] = useState(getInitialCode);
  const [output, setOutput] = useState("正在初始化 WASM…");
  const [outputClass, setOutputClass] = useState<"warning" | "error" | "">("");
  const [typeInfo, setTypeInfo] = useState<{ [name: string]: TypeInfo }>({});
  const [selectedStructName, setSelectedStructName] = useState<string | null>(
    null
  );
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [savedLayout, setSavedLayout] = useState<
    { [key: string]: number } | undefined
  >(undefined);
  const [compileAsYouType, setCompileAsYouType] = useState(true);
  const [vimMode, setVimMode] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const workerRef = useRef<TccWorkerClient | null>(null);
  const hasOutputRef = useRef(false);
  const compilationOutputRef = useRef("");
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortRunRef = useRef<(() => void) | null>(null);
  const lastCheckedCodeRef = useRef(getInitialCode());
  const currentCodeRef = useRef(getInitialCode());

  useEffect(() => {
    const worker = new TccWorkerClient(
      () => {
        setOutput("");
        setOutputClass("");

        if (code.trim()) {
          worker.checkSyntax(code, true);
        }
      },
      (text) => {
        compilationOutputRef.current += text + "\n";
        hasOutputRef.current = true;
      },
      (text) => {
        compilationOutputRef.current += text + "\n";
        hasOutputRef.current = true;
      },
      (result, typeInfoJson, debTypeInfoJson, timing, errors) => {
        if (typeInfoJson) {
          const parsed: TypeInfo[] = JSON.parse(typeInfoJson);
          const typeInfoObj = parsed.reduce(
            (acc, t) => ({ ...acc, [t.name]: t }),
            {}
          );
          setTypeInfo(typeInfoObj);
        }

        if (debTypeInfoJson) {
          const parsed: DebTypeInfo[] = JSON.parse(debTypeInfoJson);
          debTypeRegistry.set(parsed);
        }

        if (errors.length > 0) {
          errors.forEach((err) => {
            const errorType = err.isWarning ? "警告" : "错误";
            if (err.filename === "<string>") {
              compilationOutputRef.current += `${errorType}（第 ${err.lineNum} 行）：${err.msg}\n`;
            } else {
              compilationOutputRef.current += `${errorType}（${
                err.filename || "<未知文件>"
              } 第 ${err.lineNum} 行）：${err.msg}\n`;
            }
          });
        }

        const hasErrors = errors.some((e) => !e.isWarning);
        const hasWarnings = errors.some((e) => e.isWarning);

        let newOutputClass: "warning" | "error" | "" = "";
        if (hasErrors) {
          newOutputClass = "error";
        } else if (hasWarnings || hasOutputRef.current) {
          newOutputClass = "warning";
        }

        setOutput(compilationOutputRef.current);
        setOutputClass(newOutputClass);
      },
      (error) => {
        compilationOutputRef.current += "Worker 错误：" + error + "\n";
        setOutput(compilationOutputRef.current);
        setOutputClass("error");
      }
    );

    workerRef.current = worker;

    return () => {
      worker.terminate();
      abortRunRef.current?.();
    };
  }, []);

  useEffect(() => {
    const storageKey = `ebpf-party-layout`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setSavedLayout(JSON.parse(saved));
    }

    const compileSettingKey = `ebpf-party-compile-as-you-type`;
    const savedCompileSetting = localStorage.getItem(compileSettingKey);
    if (savedCompileSetting !== null) {
      setCompileAsYouType(savedCompileSetting === "true");
    }

    const savedVimMode = localStorage.getItem("ebpf-party-vim-mode");
    if (savedVimMode !== null) {
      setVimMode(savedVimMode === "true");
    }
  }, []);

  const performCheck = (code: string) => {
    compilationOutputRef.current = "";
    hasOutputRef.current = false;
    workerRef.current?.checkSyntax(code, false);
    lastCheckedCodeRef.current = code;
  };

  const compileCode = (
    code: string,
    generateTypeBindings: boolean
  ): Promise<{ success: boolean; errors: any[] }> => {
    return new Promise((resolve) => {
      compilationOutputRef.current = "";
      hasOutputRef.current = false;

      const originalOnResult = workerRef.current?.onResult;

      workerRef.current!.onResult = (
        result,
        typeInfoJson,
        debTypeInfoJson,
        timing,
        errors
      ) => {
        if (originalOnResult) {
          originalOnResult(
            result,
            typeInfoJson,
            debTypeInfoJson,
            timing,
            errors
          );
        }

        const hasErrors = errors.some((e) => !e.isWarning);
        resolve({ success: !hasErrors, errors });

        workerRef.current!.onResult = originalOnResult;
      };

      workerRef.current?.checkSyntax(code, generateTypeBindings);
    });
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    currentCodeRef.current = newCode;

    if (!compileAsYouType) {
      return;
    }

    if (!debounceTimeoutRef.current) {
      performCheck(newCode);

      debounceTimeoutRef.current = setTimeout(() => {
        if (currentCodeRef.current !== lastCheckedCodeRef.current) {
          performCheck(currentCodeRef.current);
        }
        debounceTimeoutRef.current = null;
      }, DEBOUNCE_TIME_MS);
    }
  };

  const handleSelectStruct = (name: string) => {
    if (typeInfo[name]) {
      setSelectedStructName(name);
    }
  };

  const handleRun = async () => {
    if (isRunning) return;

    localStorage.setItem(codeStorageKey, code);

    const { success } = await compileCode(code, true);

    if (!success) {
      setIsRunning(false);
      return;
    }
    setIsRunning(true);

    setEvents([]);

    const abort = runCode(
      code,
      exerciseId,
      (event) => setEvents((prev) => [...prev, event]),
      (error) => {
        console.error("Run error:", error);
        setIsRunning(false);
      },
      () => setIsRunning(false)
    );

    abortRunRef.current = abort;
  };

  const handleDelete = () => {
    localStorage.removeItem(codeStorageKey);
    setCode(starterCode);
    currentCodeRef.current = starterCode;
    lastCheckedCodeRef.current = starterCode;
    performCheck(starterCode);
  };

  const canRun = !isRunning;

  const storageKey = `ebpf-party-layout`;

  const handleLayoutChange = (layout: { [key: string]: number }) => {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  };

  const handleCompileAsYouTypeChange = (checked: boolean) => {
    setCompileAsYouType(checked);
    localStorage.setItem("ebpf-party-compile-as-you-type", String(checked));

    if (checked && currentCodeRef.current !== lastCheckedCodeRef.current) {
      performCheck(currentCodeRef.current);
    }
  };

  useEffect(() => {
    const hasCorrectAnswer = events.some((e) => e.type === "correctAnswer");
    if (hasCorrectAnswer) {
      localStorage.setItem(`exercise-completed-${exerciseId}`, "true");
    }
  }, [events, exerciseId]);

  return (
    <div className={styles.app}>
      <Group
        orientation="vertical"
        id={storageKey}
        defaultLayout={savedLayout}
        onLayoutChange={handleLayoutChange}
        style={{ height: "100%" }}
      >
        <Panel id="editor-panel" defaultSize="80%" minSize="33%" maxSize="80%">
          <div className={styles.editorPanel}>
            <div className={styles.runButtonHeader}>
              <div className={styles.controlsGroup}>
                <ControlButton
                  pressed={compileAsYouType}
                  onClick={() =>
                    handleCompileAsYouTypeChange(!compileAsYouType)
                  }
                  title="输入时实时类型检查"
                >
                  <Braces size={18} />
                </ControlButton>
                <ControlButton
                  pressed={vimMode}
                  onClick={() => {
                    const newValue = !vimMode;
                    setVimMode(newValue);
                    localStorage.setItem(
                      "ebpf-party-vim-mode",
                      String(newValue)
                    );
                  }}
                  title="Vim 模式"
                >
                  <Keyboard size={18} />
                </ControlButton>
                <ControlButton
                  onClick={() => setShowResetConfirm(true)}
                  title="重置为初始代码"
                >
                  <RotateCcw size={18} />
                </ControlButton>
              </div>
              <RunButton
                disabled={!canRun}
                isRunning={isRunning}
                onRun={handleRun}
              />
            </div>
            <div className={styles.editorWrapper}>
              <noscript>
                <div className="noscript-content">
                  <p>
                    交互式代码编辑器需要 JavaScript 才能工作。
                  </p>
                  <p>你也可以在本地用自己惯用的编辑器写。</p>
                  {codeFile && chapterId !== undefined && (
                    <p>
                      源文件：{" "}
                      <a href={`/exercises-code/${chapterId}/${codeFile}`}>
                        {codeFile}
                      </a>
                    </p>
                  )}
                  <p>接口定义如下：</p>
                  <pre>
                    {`POST /run_code/${exerciseId}
  - Body: your code`}
                  </pre>
                </div>
              </noscript>
              <CodeEditor
                code={code}
                onChange={handleCodeChange}
                onRun={handleRun}
                canRun={canRun}
                onSelectStruct={handleSelectStruct}
                vimMode={vimMode}
              />
            </div>
            {outputClass && (
              <CompilerOutput output={output} outputClass={outputClass} />
            )}
            {Object.keys(typeInfo).length > 0 && selectedStructName && (
              <>
                {selectedStructName && (
                  <StructViewer
                    typeInfo={typeInfo[selectedStructName]}
                    onClose={() => setSelectedStructName(null)}
                  />
                )}
              </>
            )}
          </div>
        </Panel>

        <Separator className={styles.resizeHandle} />

        <Panel id="events-panel" defaultSize="20%" minSize="20%">
          {events.length > 0 ? (
            <EventViewer
              events={events}
              isRunning={isRunning}
              onClear={() => setEvents([])}
              typeRegistry={typeInfo}
            />
          ) : (
            <div className={styles.emptyEventsPane}>
              运行代码后，执行事件会显示在这里
            </div>
          )}
        </Panel>
      </Group>
      {showResetConfirm && (
        <div className={styles.confirmDialog}>
          <div className={styles.confirmDialogContent}>
            <h3>重置为初始代码？</h3>
            <p>
              这会清除你的修改，恢复为最初的起始代码。
            </p>
            <div className={styles.confirmButtons}>
              <button
                className={styles.cancelButton}
                onClick={() => setShowResetConfirm(false)}
              >
                取消
              </button>
              <button
                className={styles.confirmButton}
                onClick={() => {
                  handleDelete();
                  setShowResetConfirm(false);
                }}
              >
                重置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
