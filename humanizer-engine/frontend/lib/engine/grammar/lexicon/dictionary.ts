export const ABBREVIATIONS = new Set([
  'mr','mrs','ms','dr','prof','sr','jr','st','ave','blvd','rd',
  'dept','div','est','govt','corp','inc','ltd','co',
  'jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec',
  'mon','tue','wed','thu','fri','sat','sun',
  'vs','etc','approx','appt','apt','assn','assoc',
  'vol','rev','gen','sgt','cpl','pvt','capt','lt','cmdr','adm',
  'fig','eq','no','nos','ref','refs','pg','pp','ch','sec',
  'al','ed','eds','trans',
]);

export const PRONOUNS = new Set([
  'i','me','my','myself','mine','you','your','yourself','yours','yourselves',
  'he','him','his','himself','she','her','hers','herself',
  'it','its','itself','we','us','our','ourselves','ours',
  'they','them','their','theirs','themselves','who','whom','whose',
]);

export const SINGULAR_PRONOUNS = new Set([
  'he','she','it','this','that','everyone','everybody','someone','somebody',
  'anyone','anybody','nobody','each','either','neither',
]);

export const PLURAL_PRONOUNS = new Set([
  'we','they','you','these','those','both','few','many','several',
]);

export const FIRST_PERSON_SINGULAR = new Set(['i','me','my','myself','mine']);

export const AUXILIARIES = new Set([
  'is','are','was','were','be','been','being',
  'have','has','had','do','does','did',
  'will','would','shall','should','may','might','must','can','could',
]);

export const MODALS = new Set([
  'will','would','shall','should','may','might','must','can','could',
]);

export const PREPOSITIONS = new Set([
  'in','on','at','to','for','of','with','by','from','into','onto',
  'about','above','below','between','through','during','before','after',
  'around','along','under','over','against','among','until','since',
  'without','within','beyond','upon','beside','behind','beneath','toward',
  'towards','across','past','except','near',
]);

export const CONJUNCTIONS = new Set([
  'and','but','or','nor','for','yet','so','because','although','while',
  'if','when','that','though','unless','whereas','whether','since','once',
  'than','as','however','moreover','furthermore','nevertheless','therefore',
]);

export const DETERMINERS = new Set([
  'a','an','the','this','that','these','those',
  'my','your','his','her','its','our','their',
  'some','any','many','much','few','little',
  'every','each','all','both','either','neither',
  'no','several','enough','such',
]);

export const UNCOUNTABLE_NOUNS = new Set([
  'water','rice','music','air','milk','flour','sand','sugar','butter','oil',
  'money','information','news','advice','knowledge','furniture','luggage',
  'traffic','weather','work','homework','equipment','growth','research',
  'evidence','progress','education','health','safety','justice','freedom',
  'pollution','electricity','software','hardware','data','feedback','content',
  'staff','fiction','poetry','scenery','machinery','wildlife','offspring',
  'chaos','mathematics','physics','economics','politics','ethics',
]);

export const TRANSITION_WORDS = new Set([
  'however','moreover','furthermore','therefore','consequently','nevertheless',
  'additionally','meanwhile','subsequently','similarly','conversely','likewise',
  'accordingly','hence','thus','indeed','specifically','notably','alternatively',
  'finally','firstly','secondly','thirdly','lastly','overall','in conclusion',
]);

export const VOWELS = new Set(['a','e','i','o','u']);

export const VOWEL_SOUND_EXCEPTIONS = new Set([
  'hour','honor','honest','heir','herb','homage',
]);

export const CONSONANT_SOUND_EXCEPTIONS = new Set([
  'university','uniform','unique','unit','union','united','universal','user',
  'usual','utility','european','one','once','ubiquitous','unicorn','uranium',
  'uterus','utensil','usurp',
]);
