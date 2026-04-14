from app.services.sentence_splitter import SentenceSplitter


def test_basic_split():
    s = SentenceSplitter()
    sents = s.flat_sentences("Hello world. This is a test.")
    assert len(sents) == 2
    assert sents[0].text == "Hello world."
    assert sents[1].text.strip() == "This is a test."


def test_abbreviation_no_split():
    s = SentenceSplitter()
    sents = s.flat_sentences("Dr. Smith went home.")
    assert len(sents) == 1


def test_dotted_abbreviation():
    s = SentenceSplitter()
    sents = s.flat_sentences("The U.S. Supreme Court ruled.")
    assert len(sents) == 1


def test_decimal_no_split():
    s = SentenceSplitter()
    sents = s.flat_sentences("The value is 3.14. Next sentence.")
    # "3.14" should not cause a split within the number
    # Should be 2 sentences: "The value is 3.14." and "Next sentence."
    assert len(sents) == 2
    assert "3.14" in sents[0].text


def test_ellipsis_no_split():
    s = SentenceSplitter()
    sents = s.flat_sentences("He said... And then left.")
    assert len(sents) == 1


def test_paragraph_split():
    s = SentenceSplitter()
    text = "First paragraph.\n\nSecond paragraph."
    paras = s.split(text)
    assert len(paras) == 2
    assert paras[0].sentences[0].paragraph_index == 0
    assert paras[1].sentences[0].paragraph_index == 1


def test_char_offsets_stable():
    s = SentenceSplitter()
    text = "First sentence. Second sentence."
    sents = s.flat_sentences(text)
    for sent in sents:
        assert text[sent.start:sent.end] == sent.text


def test_tokens_populated():
    s = SentenceSplitter()
    sents = s.flat_sentences("Hello world.")
    assert len(sents[0].tokens) == 2
    assert sents[0].tokens[0].text == "Hello"
    assert sents[0].tokens[1].text == "world."


def test_single_letter_initial():
    s = SentenceSplitter()
    sents = s.flat_sentences("J. K. Rowling wrote Harry Potter.")
    assert len(sents) == 1


def test_multiple_abbreviations():
    s = SentenceSplitter()
    sents = s.flat_sentences("Mr. Smith met Dr. Jones. They talked.")
    assert len(sents) == 2
    assert "Mr. Smith" in sents[0].text
    assert "Dr. Jones" in sents[0].text


def test_legal_case_v_abbreviation():
    s = SentenceSplitter()
    sents = s.flat_sentences("In Brown v. Board of Education the court ruled.")
    assert len(sents) == 1
    assert "Brown v. Board" in sents[0].text
