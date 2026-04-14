from app.services.rule_engine import RuleEngine


def test_rules_load():
    engine = RuleEngine()
    assert engine.rule_count > 0


def test_double_period():
    engine = RuleEngine()
    result, edits = engine.apply("End of sentence..")
    assert ".." not in result
    assert any(e.type == "punctuation" for e in edits)


def test_double_comma():
    engine = RuleEngine()
    result, _ = engine.apply("Hello,, world")
    assert ",," not in result


def test_missing_space_after_comma():
    engine = RuleEngine()
    result, _ = engine.apply("Hello,world")
    assert result == "Hello, world"


def test_domain_filtering():
    engine = RuleEngine()
    # Legal-only rule should not fire for general domain
    text = "§1 of the statute"
    result_general, edits_general = engine.apply(text, domain="general")
    result_legal, edits_legal = engine.apply(text, domain="legal")
    # The legal rule adds a space after §
    assert "§ 1" in result_legal
