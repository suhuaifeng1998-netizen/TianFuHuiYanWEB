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
        ExampleButton("database-filter", "条件筛选", (
            "筛选含 Li、Fe、O，带隙大于 1 eV、凸包能不超过 0.05 eV/atom 的材料，"
            "只返回20条，展示材料ID、化学式、带隙和凸包能。",
            "筛选仅含 Si 和 O，带隙大于 3 eV、凸包能不超过 0.05 eV/atom 的材料，"
            "最多返回20条，展示材料ID、化学式、带隙和凸包能。",
            "筛选含 Ti 和 O、但不含 Pb 和 Cd 的非金属材料，带隙大于 1 eV、"
            "凸包能不超过 0.05 eV/atom，最多返回20条，"
            "展示材料ID、化学式、带隙和凸包能。",
            "筛选仅含 Ga 和 N 的非金属材料，带隙在 1–3 eV 之间、"
            "凸包能不超过 0.05 eV/atom，最多返回20条，"
            "展示材料ID、化学式、带隙和凸包能。",
        )),
        ExampleButton("database-sort", "排序与数量", (
            "筛选含 Li、Fe、O，带隙大于 1 eV，凸包能不超过 0.05 eV/atom 的材料，"
            "按带隙由小到大返回前10条，展示材料ID、化学式、带隙和凸包能。",
            "查询仅含 Si 和 O、凸包能不超过 0.05 eV/atom 的材料，"
            "按带隙从高到低排序，返回前10条，展示材料ID、化学式和带隙。",
            "查询凸包能不超过 0.05 eV/atom 的 TiO₂ 结构，按密度从大到小返回前10条，"
            "展示材料ID、化学式、密度和凸包能。",
            "查询非金属、凸包能不超过 0.05 eV/atom 的 WO₃ 结构，"
            "按凸包能从小到大返回前10条，展示材料ID、化学式、带隙和凸包能。",
        )),
        ExampleButton("database-detail", "材料详情", (
            "查询 mp-149 的材料详情，返回化学式、带隙、密度、"
            "凸包上能量、晶系和空间群。",
            "查询 mp-13 的材料详情，返回化学式、密度、形成能和凸包上能量。",
            "查询 TiO₂ 的材料信息，最多返回3个结构，展示材料ID、化学式、带隙、密度、"
            "晶系和空间群。",
            "查询 WO₃ 的材料信息，最多返回3个结构，展示材料ID、化学式、带隙、密度、"
            "晶系和空间群。",
        )),
        ExampleButton("database-compare", "多材料比较", (
            "比较 mp-149、mp-13 和 mp-2534 的带隙、密度、形成能和凸包上能量，"
            "用表格展示。",
            "比较 mp-390 和 mp-2657 的带隙、密度和凸包上能量，用表格展示。",
            "比较 mp-18773、mp-19342 和 mp-19443 的带隙、密度和凸包上能量，"
            "用表格展示。",
            "比较 mp-149 和 mp-2534 的带隙、形成能和凸包上能量，用表格展示。",
        )),
    )),
    ExampleCategory("数据分析", (
        ExampleButton("data-quality", "数据质量", (
            "检查这份数据的字段类型、缺失值和重复记录，不要修改原始数据。",
        )),
        ExampleButton("data-describe", "描述统计", (
            "计算 reaction_time_min 和 degradation_percent 的有效数量、均值、中位数、"
            "标准差、最小值和最大值，不分组，不修改数据。",
        )),
        ExampleButton("data-groups", "分组统计", (
            "按 material 分组，统计 degradation_percent 的有效数量、均值和标准差，"
            "仅描述这份模拟数据，不判断真实材料优劣。",
        )),
        ExampleButton("data-correlation", "相关性分析", (
            "计算 reaction_time_min 与 degradation_percent 的 Pearson 相关系数"
            "和有效配对数量，"
            "不分组，不作因果判断。",
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
