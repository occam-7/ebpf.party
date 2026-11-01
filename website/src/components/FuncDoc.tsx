import type { FuncDoc as FuncDocType } from "../types/function-docs";
import styles from "./FuncDoc.module.css";

interface FuncDocProps {
  doc: FuncDocType;
}

export default function FuncDoc({ doc }: FuncDocProps) {
  return (
    <details>
      <summary>{doc.description}</summary>
      <div className={styles.function}>
        函数
        <span className={styles.signature}> {doc.function_name} </span>
        <a
          className={styles.docsLink}
          href={doc.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          完整文档
        </a>
        <dl className={styles.args}>
          {doc.args && doc.args.length > 0 && (
            <>
              <dt>参数：</dt>
              {doc.args.map((arg, index) => (
                <dd key={index}>
                  <code>
                    {arg.type} {arg.name}
                  </code>
                  {arg.description}
                </dd>
              ))}
            </>
          )}
        </dl>
        {doc.returns && (
          <>
            {doc.returns.description.success ? (
              <>
                <div>成功时返回 {doc.returns.description.success}</div>
                <div>出错时返回 {doc.returns.description.error}</div>
              </>
            ) : (
              <>返回 {doc.returns.description}</>
            )}
          </>
        )}
      </div>
    </details>
  );
}
