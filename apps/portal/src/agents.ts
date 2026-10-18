export type AgentEntry = {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: 'robot' | 'materials' | 'medical';
  href?: string;
  action: string;
};

// Add an entry here when another workbench is connected to the portal.
export const agents: AgentEntry[] = [
  {
    id: 'medical',
    name: '医学知识问答 Agent',
    category: 'MEDICAL KNOWLEDGE',
    description: '有据可查的医学知识解答与关联探索',
    icon: 'medical',
    href: '/agent/medical/',
    action: '打开医学知识工作台',
  },
  {
    id: 'robot',
    name: '智能实验机械臂Agent',
    category: 'ROBOTICS',
    description: '实验任务理解、状态监测与机械臂工作台',
    icon: 'robot',
    href: import.meta.env.VITE_ROBOT_ENTRY?.trim() || '/agent/robot/',
    action: '打开智能实验机械臂工作台',
  },
  {
    id: 'materials',
    name: '材料筛选 Agent',
    category: 'MATERIALS SCREENING',
    description: '依据成分与性质筛选材料，结合文献开展比较分析',
    icon: 'materials',
    href: import.meta.env.VITE_MATERIALS_ENTRY?.trim() || '/agent/materials/',
    action: '打开材料筛选工作台',
  },
];
