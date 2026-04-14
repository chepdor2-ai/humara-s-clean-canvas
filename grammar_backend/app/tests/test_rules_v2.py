"""Tests for Phase 5 YAML rule packs: agreement, article, grammar."""

from app.services.rule_engine import RuleEngine


def test_rules_load_new_packs():
    engine = RuleEngine()
    # Should have loaded original 24 + new agreement (8) + article (8) + grammar (12) rules
    # Some may be disabled, but they still count in total
    assert engine.rule_count >= 40


# ── Agreement rules ──

def test_he_have_corrected():
    engine = RuleEngine()
    result, edits = engine.apply("He have a dog.")
    assert "He has" in result
    assert any(e.rule_id and e.rule_id.startswith("agree") for e in edits)


def test_she_have_corrected():
    engine = RuleEngine()
    result, _ = engine.apply("She have two cats.")
    assert "She has" in result


def test_they_has_corrected():
    engine = RuleEngine()
    result, _ = engine.apply("They has finished.")
    assert "They have" in result


def test_he_dont_corrected():
    engine = RuleEngine()
    result, _ = engine.apply("He don't like it.")
    assert "He doesn't" in result


# ── Article rules ──

def test_a_before_vowel():
    engine = RuleEngine()
    result, edits = engine.apply("This is a apple.")
    assert "an apple" in result
    assert any(e.rule_id and e.rule_id.startswith("art") for e in edits)


def test_an_before_consonant():
    engine = RuleEngine()
    result, _ = engine.apply("This is an big dog.")
    assert "a big" in result


def test_a_before_university():
    engine = RuleEngine()
    result, _ = engine.apply("She attended an university.")
    assert "a university" in result


def test_a_before_one():
    engine = RuleEngine()
    result, _ = engine.apply("It is an one-time event.")
    assert "a one-time" in result


def test_an_before_honest():
    engine = RuleEngine()
    result, _ = engine.apply("He is a honest man.")
    assert "an honest" in result


# ── Grammar rules ──

def test_repeated_word():
    engine = RuleEngine()
    result, edits = engine.apply("The the cat sat on the mat.")
    assert "The the" not in result or "the the" not in result.lower()
    assert any(e.rule_id and e.rule_id.startswith("gram") for e in edits)


def test_could_of():
    engine = RuleEngine()
    result, _ = engine.apply("He could of gone.")
    assert "could have" in result


def test_should_of():
    engine = RuleEngine()
    result, _ = engine.apply("She should of known.")
    assert "should have" in result


def test_then_than_comparative():
    engine = RuleEngine()
    result, _ = engine.apply("He is better then her.")
    assert "better than" in result


def test_alot():
    engine = RuleEngine()
    result, _ = engine.apply("I have alot of work.")
    assert "a lot" in result


def test_irregardless():
    engine = RuleEngine()
    result, _ = engine.apply("Irregardless of the outcome.")
    assert "regardless" in result.lower()


def test_etc_period():
    engine = RuleEngine()
    result, _ = engine.apply("apples, bananas, etc and more")
    assert "etc." in result


def test_double_conjunction():
    engine = RuleEngine()
    result, _ = engine.apply("cats and and dogs")
    assert "and and" not in result


def test_rule_edits_have_rule_id():
    engine = RuleEngine()
    _, edits = engine.apply("He have alot of the the problems.")
    for e in edits:
        assert e.rule_id is not None, f"Edit missing rule_id: {e.original} → {e.corrected}"
