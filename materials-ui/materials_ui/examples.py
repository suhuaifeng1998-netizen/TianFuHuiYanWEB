"""UI-only example questions; choosing one never runs an agent."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ExampleButton:
    key: str
    label: str
    questions: tuple[str, ...]


@dataclass(frozen=True)
class ExampleCategory:
    title: str
    examples: tuple[ExampleButton, ...]


EXAMPLE_CATEGORIES = (
    ExampleCategory("数据库", (
        ExampleButton("database-search", "数据库检索", (
            "请从 Materials Project 筛选包含 Li、Fe、O 的材料，允许含其他元素，"
            "要求带隙大于 1 eV、凸包能不超过 0.05 eV/atom，按带隙升序取前20条，"
            "展示材料ID、化学式、带隙、密度、形成能和凸包能。"
            "查询排名第一的材料的晶系和空间群；比较前三条材料的上述四项数值属性；"
            "统计这批结果中带隙和密度的有效数量、均值、中位数、标准差及范围。",
            "请查询化学式严格为 TiO₂、非金属且凸包能不超过 0.05 eV/atom 的结构，"
            "按密度降序取前30条，展示材料ID、化学式、密度、带隙、形成能和凸包能。"
            "比较前三个结构的密度、带隙和凸包能；统计这批结果中密度和带隙的有效数量、"
            "均值、中位数、标准差及范围；使用 IQR 方法检查密度离群值，"
            "说明方法和检测结果。",
            "请筛选包含 Ti 和 O、允许含其他元素但不含 Pb 和 Cd 的非金属材料，"
            "要求带隙在 1–4 eV 之间、凸包能不超过 0.05 eV/atom，按凸包能升序取前20条，"
            "展示材料ID、化学式、带隙、密度、形成能和凸包能。"
            "查询排名第一的材料的晶系和空间群；比较前三条材料的带隙、密度、形成能和凸包能；"
            "使用 IQR 方法检查这批结果中的带隙离群值",
        )),
    )),
    ExampleCategory("数据分析", (
        ExampleButton("data-analysis", "数据分析", (
            "请综合分析当前上传的光催化实验表格。"
            "先检查字段类型、缺失值和重复记录；计算 reaction_time_min "
            "与 degradation_percent "
            "的有效数量、均值、中位数、标准差、最小值和最大值；按 material 分组，"
            "统计各组降解率的有效数量、均值和标准差；计算整份表格中反应时间与降解率的 "
            "Pearson 相关系数，说明有效配对数量。最后概括主要发现和数据局限，"
            "不修改原始数据，不作因果判断，也不将模拟数据结果解释为真实材料优劣。",
            "请继续分析当前上传的光催化实验表格。"
            "按 material 分组，分别统计 reaction_time_min 与 degradation_percent "
            "的有效数量、均值、中位数、标准差、最小值和最大值；"
            "使用 IQR 方法检查整份表格中这两个字段的离群值，报告阈值、数量和对应记录；"
            "保留重复记录和缺失值，不修改原始数据，说明统计时的缺失值处理方式；"
            "不作因果判断，不将模拟数据结果解释为真实材料优劣。",
        )),
    )),
    ExampleCategory("文献与知识", (
        ExampleButton("literature-search", "文献检索", (
            "帮我检索3D打印生物活性玻璃支架孔结构与成骨的近年论文。",
            "帮我检索 WO₃ 用于光催化降解亚甲基蓝的实验论文，"
            "先展示候选文献，不分析全文。",
            "帮我检索磷酸铁锂（LiFePO₄）正极材料的近年论文，先展示候选文献，不分析全文。",
        )),
        ExampleButton("literature-preview", "论文预览", (
            "预览我上传的论文。",
        )),
    )),
    ExampleCategory("综合任务演示", (
        ExampleButton("literature-complete", "① 初筛与文献检索", (
            "请比较 TiO₂ 和 WO₃ 用于光催化降解亚甲基蓝的研究潜力。"
            "先查询 Materials Project 中非金属、凸包能≤0.05 eV/atom 的对应结构，"
            "分析带隙和稳定性，再检索实验文献。等我上传全文并确认后，"
            "提取降解性能和测试条件，给出有引用支持的结论及研究建议，"
            "不直接比较不同条件下的降解率。",
        )),
        ExampleButton("complete-preview", "② 四篇全文预览", (
            "先预览上传的四篇文献。",
        )),
        ExampleButton("complete-conclusion", "③ 确认分析与结论", (
            "确认分析上传的4篇论文并得出结论。",
        )),
    )),
)

_EXAMPLES_BY_KEY = {
    example.key: example
    for category in EXAMPLE_CATEGORIES
    for example in category.examples
}


def next_example(
    key: str, cursors: dict[str, int] | None,
) -> tuple[str, dict[str, int]]:
    """Advance only this button's per-browser-session cursor, without mutation."""
    example = _EXAMPLES_BY_KEY[key]
    updated = dict(cursors or {})
    index = updated.get(key, 0) % len(example.questions)
    updated[key] = (index + 1) % len(example.questions)
    return example.questions[index], updated
