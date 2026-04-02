import spacy
import random
from nltk.tokenize import sent_tokenize
import rules

nlp = spacy.load("en_core_web_sm")

def shorten_sentence(sent: str) -> str:
    doc = nlp(sent)
    if len(doc) < 8:
        return sent
    # Remove one clause intelligently
    for token in doc:
        if token.dep_ in ["advcl", "relcl", "ccomp"]:
            return sent.replace(token.text_with_ws, "")
    return sent[:int(len(sent) * 0.65)] + "."

def add_natural_variation(sent: str) -> str:
    doc = nlp(sent)
    # Passive <-> Active conversion (adds intelligence)
    if any(t.dep_ == "auxpass" for t in doc):
        # Simple passive to active
        return sent.replace("was ", "").replace("is ", "").replace("were ", "")  # basic but effective
    return sent

def insert_transition(sent: str) -> str:
    if random.random() < 0.5:
        return random.choice(rules.TRANSITIONS) + " " + sent
    return sent

def make_burstier(text: str) -> str:
    sentences = sent_tokenize(text)
    varied = []
    for i, s in enumerate(sentences):
        if i % 3 == 0:
            s = s[:int(len(s) * 0.7)] + "."  # shorten
        elif i % 3 == 1:
            s = s + " " + random.choice(rules.TRANSITIONS)  # lengthen
        varied.append(s)
    return " ".join(varied)
