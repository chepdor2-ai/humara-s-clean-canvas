import re
from validation_post_process import fix_mid_sentence_capitalization

test_output = """Government Policy has been one of The most influential factors in The expansion of Secondary Education in Kenya.

Since independence, successive governments have put first Training as a central part of national Development strategies (Republic of Kenya, 2005). Across The country, this Commitment can be seen in The formulation of policies aimed at increasing access, improving equity, and boosting The overall quality of Instruction. Such policies have led to The establishment of more Secondary schools and a steady rise in student enrolment Over The years, Oketch & Rolleston (2007) argues that one major initiative was The Introduction of Free Day Secondary Teaching (FDSE) in 2008. Deeply reduced The cost burden on Parents. Students from low-income families who previously could not afford Secondary Education were given an opportunity to continue their studies. Besides subsidizing tuition, The Government has also invested heavily in infrastructure Development, including classrooms and laboratories, to support The growing student Population."""

test_input = """Government Policy and Commitment

Government Policy has been one of the most influential factors in the expansion of secondary education in Kenya.

Since independence, successive governments have prioritized education as a central part of national development strategies (Republic of Kenya, 2005). Across the country, this commitment can be seen in the formulation of policies aimed at increasing access, improving equity, and boosting the overall quality of instruction. Such policies have led to the establishment of more secondary schools and a steady rise in student enrolment over the years, Oketch & Rolleston (2007) argues that one major initiative was the introduction of Free Day Secondary Education (FDSE) in 2008, which deeply reduced the cost burden on parents. Students from low-income families who previously could not afford secondary education were given an opportunity to continue their studies. Besides subsidizing tuition, the government has also invested heavily in infrastructure development, including classrooms and laboratories, to support the growing student population."""

fixed = fix_mid_sentence_capitalization(test_output, test_input)
print("=== FIXED OUTPUT ===")
print(fixed)
print()

# Check proper nouns are preserved
print("--- Proper noun checks ---")
for word in ["Oketch", "Rolleston", "Kenya", "FDSE", "Republic"]:
    if word in fixed:
        print(f"  {word}: PRESERVED (correct)")
    else:
        print(f"  {word}: MISSING (incorrect)")

# Check common words are lowercased mid-sentence
print("--- Common word checks ---")
for word in ["The", "Education", "Training", "Development", "Population"]:
    mid_matches = re.findall(r"(?<=[a-z,;] )" + word + r"(?=[ ,.])", fixed)
    if mid_matches:
        print(f"  Mid-sentence '{word}': STILL CAPITALIZED (bug)")
    else:
        print(f"  Mid-sentence '{word}': lowercase (correct)")
