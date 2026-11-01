import type { FuncDoc as FuncDocType } from "../types/function-docs";
import FuncDoc from "./FuncDoc";
import styles from "./QuickReference.module.css";

interface QuickReferenceProps {
  stringMatching?: boolean;
  stringSearch?: boolean;
  mapUsage?: boolean;
  userSpaceReading?: boolean;
  kernelSpaceReading?: boolean;
  kprobeArgs?: boolean;
  pid?: boolean;
  comm?: boolean;
}

const stringMatchingFuncs: FuncDocType[] = [
  {
    function_name: "bpf_strncmp",
    description: "比较两个字符串是否相等",
    args: [
      {
        type: "char*",
        name: "buf",
        description: "要比较的动态缓冲区",
      },
      {
        type: "u32",
        name: "buf_sz",
        description: "动态缓冲区的长度",
      },
      {
        type: "const char*",
        name: "buf2",
        description: "用来比较的字符串字面量",
      },
    ],
    returns: {
      type: "int",
      description: "相等时返回 0，不等时返回非 0",
    },
    docsUrl: "https://docs.ebpf.io/linux/helper-function/bpf_strncmp/",
  },
];

const stringSearchFuncs: FuncDocType[] = [
  {
    function_name: "bpf_strstr",
    description: "在字符串中查找子串",
    args: [
      {
        type: "const char*",
        name: "haystack",
        description: "被搜索的字符串",
      },
      {
        type: "const char*",
        name: "needle",
        description: "要查找的子串",
      },
    ],
    returns: {
      type: "long",
      description: "子串在字符串中的下标，出错时为负值",
    },
    docsUrl: "https://docs.ebpf.io/linux/kfuncs/bpf_strstr/",
  },
  {
    function_name: "bpf_strchr",
    description: "在字符串中查找字符",
    args: [
      {
        type: "const char*",
        name: "str",
        description: "被搜索的字符串",
      },
      {
        type: "char",
        name: "c",
        description: "要查找的字符",
      },
    ],
    returns: {
      type: "long",
      description: "字符在字符串中的下标，出错时为负值",
    },
    docsUrl: "https://docs.ebpf.io/linux/kfuncs/bpf_strchr/",
  },
];

const mapUsageFuncs: FuncDocType[] = [
  {
    function_name: "bpf_map_update_elem",
    description: "插入或更新 map 条目",
    args: [
      {
        type: "void*",
        name: "map",
        description: "指向 map 的指针",
      },
      {
        type: "const void*",
        name: "key",
        description: "指向 key 的指针",
      },
      {
        type: "const void*",
        name: "value",
        description: "指向 value 的指针",
      },
      {
        type: "u64",
        name: "flags",
        description:
          "BPF_ANY (create or update), BPF_NOEXIST (create only), or BPF_EXIST (update only)",
      },
    ],
    returns: {
      type: "int",
      description: {
        success: "0",
        error: "负的错误码",
      },
    },
    docsUrl: "https://docs.ebpf.io/linux/helper-function/bpf_map_update_elem/",
  },
  {
    function_name: "bpf_map_lookup_elem",
    description: "按键从 map 取值",
    args: [
      {
        type: "void*",
        name: "map",
        description: "指向 map 的指针",
      },
      {
        type: "const void*",
        name: "key",
        description: "指向 key 的指针",
      },
    ],
    returns: {
      type: "void*",
      description: "找到时返回指向 value 的指针，否则返回 NULL",
    },
    docsUrl: "https://docs.ebpf.io/linux/helper-function/bpf_map_lookup_elem/",
  },
  {
    function_name: "bpf_map_delete_elem",
    description: "删除 map 中的条目",
    args: [
      {
        type: "void*",
        name: "map",
        description: "指向 map 的指针",
      },
      {
        type: "const void*",
        name: "key",
        description: "指向要删除的 key 的指针",
      },
    ],
    returns: {
      type: "int",
      description: {
        success: "0",
        error: "key 不存在时返回负的错误码",
      },
    },
    docsUrl: "https://docs.ebpf.io/linux/helper-function/bpf_map_delete_elem/",
  },
];

const kprobeArgsFuncs: FuncDocType[] = [
  {
    function_name: "PT_REGS_PARM{1-8}",
    description: "从 kprobe 上下文中取出第 N 个参数",
    args: [
      {
        type: "struct pt_regs*",
        name: "ctx",
        description: "包含 CPU 寄存器的 kprobe 上下文",
      },
    ],
    returns: {
      type: "unsigned long",
      description: "函数第 N 个参数的值",
    },
    docsUrl: "https://docs.ebpf.io/ebpf-library/libbpf/ebpf/PT_REGS_PARM/",
  },
];

const kernelSpaceReadingFuncs: FuncDocType[] = [
  {
    function_name: "bpf_probe_read_kernel",
    description: "从内核空间读字节到内核缓冲区",
    args: [
      {
        type: "void*",
        name: "dst",
        description: "读入的内核缓冲区",
      },
      {
        type: "u32",
        name: "size",
        description: "要读取的字节数",
      },
      {
        type: "const void*",
        name: "src",
        description: "内核空间指针",
      },
    ],
    returns: {
      type: "int",
      description: {
        success: "0",
        error: "负的错误码",
      },
    },
    docsUrl:
      "https://docs.ebpf.io/linux/helper-function/bpf_probe_read_kernel/",
  },
  {
    function_name: "bpf_probe_read_kernel_str",
    description: "从内核空间读字符串到内核缓冲区",
    args: [
      {
        type: "void*",
        name: "dst",
        description: "读入的内核缓冲区",
      },
      {
        type: "u32",
        name: "size",
        description: "最多读取的字节数",
      },
      {
        type: "const void*",
        name: "src",
        description: "指向内核空间字符串的指针",
      },
    ],
    returns: {
      type: "int",
      description: {
        success: "读取的字节数（含结尾的 \\0）",
        error: "负的错误码",
      },
    },
    docsUrl:
      "https://docs.ebpf.io/linux/helper-function/bpf_probe_read_kernel_str/",
  },
];

const userSpaceReadingFuncs: FuncDocType[] = [
  {
    function_name: "bpf_probe_read_user_str",
    description: "从用户空间读字符串到内核缓冲区",
    args: [
      {
        type: "void*",
        name: "dst",
        description: "读入的内核缓冲区",
      },
      {
        type: "u32",
        name: "size",
        description: "最多读取的字节数",
      },
      {
        type: "const void*",
        name: "src",
        description: "指向用户空间字符串的指针",
      },
    ],
    returns: {
      type: "int",
      description: {
        success: "读取的字节数（含结尾的 \\0）",
        error: "负的错误码",
      },
    },
    docsUrl:
      "https://docs.ebpf.io/linux/helper-function/bpf_probe_read_user_str/",
  },
  {
    function_name: "bpf_probe_read_user",
    description: "从用户空间读字节到内核缓冲区",
    args: [
      {
        type: "void*",
        name: "dst",
        description: "读入的内核缓冲区",
      },
      {
        type: "u32",
        name: "size",
        description: "要读取的字节数",
      },
      {
        type: "const void*",
        name: "src",
        description: "用户空间指针",
      },
    ],
    returns: {
      type: "int",
      description: {
        success: "0",
        error: "负的错误码",
      },
    },
    docsUrl: "https://docs.ebpf.io/linux/helper-function/bpf_probe_read_user/",
  },
];

const getPID: FuncDocType[] = [
  {
    function_name: "bpf_get_current_pid_tgid",
    description: "获取当前进程 ID 与线程 ID",
    args: [],
    returns: {
      type: "u64",
      description: "高 32 位是 PID，低 32 位是 TID。",
    },
    docsUrl:
      "https://docs.ebpf.io/linux/helper-function/bpf_get_current_pid_tgid/",
  },
];
const getCOMM: FuncDocType[] = [
  {
    function_name: "bpf_get_current_comm",
    description: "获取当前进程名",
    args: [
      {
        type: "char*",
        name: "buf",
        description: "用来写入进程名的缓冲区",
      },
      {
        type: "u32",
        name: "size",
        description: "缓冲区大小",
      },
    ],
    returns: {
      type: "int",
      description: {
        success: "0",
        error: "负的错误码",
      },
    },
    docsUrl: "https://docs.ebpf.io/linux/helper-function/bpf_get_current_comm/",
  },
];

export default function QuickReference({
  stringMatching = false,
  stringSearch = false,
  mapUsage = false,
  userSpaceReading = false,
  kernelSpaceReading = false,
  kprobeArgs = false,
  pid = false,
  comm = false,
}: QuickReferenceProps) {
  const funcs = [
    pid ? getPID : [],
    comm ? getCOMM : [],
    stringMatching ? stringMatchingFuncs : [],
    stringSearch ? stringSearchFuncs : [],
    mapUsage ? mapUsageFuncs : [],
    kprobeArgs ? kprobeArgsFuncs : [],
    userSpaceReading ? userSpaceReadingFuncs : [],
    kernelSpaceReading ? kernelSpaceReadingFuncs : [],
  ].flat();
  return (
    <div className={styles.reference}>
      <b className={styles.title}>速查表</b>
      {funcs.map((func, index) => (
        <FuncDoc key={index} doc={func} />
      ))}
    </div>
  );
}
