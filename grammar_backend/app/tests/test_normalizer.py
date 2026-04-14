from app.services.normalizer import Normalizer


def test_double_spaces():
    n = Normalizer()
    result, edits = n.normalize("Hello  world")
    assert result == "Hello world"
    assert any(e.type == "spacing" for e in edits)


def test_space_before_comma():
    n = Normalizer()
    result, _ = n.normalize("Hello ,world")
    assert result == "Hello,world"


def test_space_before_period():
    n = Normalizer()
    result, _ = n.normalize("Hello .")
    assert result == "Hello."


def test_detached_apostrophe():
    n = Normalizer()
    result, _ = n.normalize("The Court ' s decision")
    assert result == "The Court's decision"


def test_bracket_spacing():
    n = Normalizer()
    result, _ = n.normalize("( hello )")
    assert result == "(hello)"


def test_no_change():
    n = Normalizer()
    result, edits = n.normalize("This is perfectly fine.")
    assert result == "This is perfectly fine."
    assert len(edits) == 0
