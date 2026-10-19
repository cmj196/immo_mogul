// Invented people for tenants, applicants and sellers. No real person is meant. Names are common
// Swiss first names and surnames combined at random; stories are one line each.

export const FIRST_NAMES = [
  'Anna', 'Luca', 'Mia', 'Noah', 'Lena', 'Leon', 'Sara', 'David', 'Nina', 'Jonas', 'Laura', 'Elias',
  'Julia', 'Samuel', 'Elena', 'Nico', 'Sofia', 'Fabio', 'Livia', 'Matteo', 'Chiara', 'Simon', 'Céline',
  'Jan', 'Nadia', 'Tobias', 'Selina', 'Pascal', 'Fiona', 'Raphael', 'Jasmin', 'Yannick', 'Priya',
  'Daniel', 'Aylin', 'Marco', 'Hanna', 'Reto', 'Zoë', 'Dario', 'Irene', 'Kofi', 'Mireille', 'Beat',
  'Ursula', 'Peter', 'Rosa', 'Heinz', 'Verena', 'Andrea', 'Tomás', 'Ewa', 'Mehmet', 'Giulia', 'Olu',
];

export const LAST_NAMES = [
  'Meier', 'Müller', 'Schmid', 'Keller', 'Weber', 'Huber', 'Schneider', 'Fischer', 'Baumann',
  'Frei', 'Brunner', 'Gerber', 'Widmer', 'Zimmermann', 'Moser', 'Graf', 'Wyss', 'Roth', 'Suter',
  'Bianchi', 'Rossi', 'Ferreira', 'Costa', 'Nguyen', 'Yilmaz', 'Kovač', 'Novak', 'Petrović', 'Silva',
  'Steiner', 'Arnold', 'Kaufmann', 'Hofer', 'Lüthi', 'Bachmann', 'Ammann', 'Hug', 'Marti', 'Studer',
  'Okafor', 'Haddad', 'Sharma', 'Lindqvist', 'Dubois', 'Martin', 'Garcia', 'Kowalski', 'Tanaka',
];

// Applicant profiles: how they pay, how long they tend to stay, what they say.
export const APPLICANT_PROFILES = [
  { id: 'steady', label: 'Steady', arrearsRisk: 0.01, stayBonus: 1.4, lines: ['Works at the hospital, wants to stay for years.', 'Teacher at the Kantonsschule, has lived in the Kreis for a decade.', 'Engineer at the SBB, quiet, no pets.'] },
  { id: 'young', label: 'Starting out', arrearsRisk: 0.04, stayBonus: 0.7, lines: ['Two students sharing, parents guarantee the rent.', 'First job at a start-up in the Binz, might move for work.', 'Apprentice and his sister, references from their last landlord.'] },
  { id: 'family', label: 'Family', arrearsRisk: 0.02, stayBonus: 1.6, lines: ['Couple with a toddler, want to be near the Bäckeranlage.', 'Family of four moving from Winterthur for the commute.', 'Expecting their second child, looking for somewhere to stay put.'] },
  { id: 'expat', label: 'New in town', arrearsRisk: 0.03, stayBonus: 0.8, lines: ['Relocating for a bank job, employer pays the deposit.', 'Researcher at the ETH on a four-year contract.', 'Consultant, travels a lot, wants something central.'] },
  { id: 'tight', label: 'Stretching', arrearsRisk: 0.09, stayBonus: 1.0, lines: ['Freelance designer, income varies, offers three months upfront.', 'Musician and part-time barista, very keen on the flat.', 'Recently separated, needs to move quickly.'] },
];

export const TENANT_STORIES = [
  'Has lived here since the old owner painted the stairwell.',
  'Keeps bees on the balcony, with the neighbours’ blessing.',
  'Night-shift nurse, sleeps during the day, asks for quiet renovations.',
  'Runs a small tailoring business from the back room.',
  'Retired tram driver, knows every neighbour by name.',
  'Young couple, both at the university, pay on the first.',
  'Pensioner on a fixed income, nervous about any rent letter.',
  'Chef at a place on Langstrasse, rarely home before midnight.',
  'Moved in last spring, still has boxes in the hall.',
  'Architect, has opinions about the kitchen.',
  'Three flatmates, one of them is always moving out.',
  'Grew up in the flat, took over the lease from her parents.',
];

export const SELLER_TYPES = Object.freeze({
  estate: { id: 'estate', label: 'Estate sale', line: 'The heirs want it settled before the summer.', reserve: [0.92, 0.97], premium: [0, 6], patience: 2, counterStep: 0.55 },
  relocation: { id: 'relocation', label: 'Moving abroad', line: 'The owner starts a job in Singapore in three months.', reserve: [0.94, 0.98], premium: [2, 8], patience: 2, counterStep: 0.5 },
  divorce: { id: 'divorce', label: 'Separation', line: 'Two owners who no longer agree on anything except selling.', reserve: [0.93, 0.98], premium: [3, 9], patience: 2, counterStep: 0.5 },
  developer: { id: 'developer', label: 'Developer', line: 'A developer freeing up cash for the next project.', reserve: [0.96, 1.0], premium: [6, 14], patience: 3, counterStep: 0.4 },
  pensioner: { id: 'pensioner', label: 'Long-time owner', line: 'Owned it for forty years and is in no hurry at all.', reserve: [0.99, 1.04], premium: [6, 15], patience: 3, counterStep: 0.3 },
  investor: { id: 'investor', label: 'Investor', line: 'A professional seller who knows the comparables.', reserve: [0.97, 1.01], premium: [4, 10], patience: 3, counterStep: 0.4 },
});

export const BUYER_TYPES = Object.freeze({
  family: { id: 'family', label: 'Family buyer', line: 'A couple who fell for the light in the living room.', reserve: [0.98, 1.04], opening: [0.90, 0.96], patience: 3, counterStep: 0.45 },
  investor: { id: 'investor', label: 'Investor', line: 'Wants the yield and will walk if the price does not work.', reserve: [0.94, 1.0], opening: [0.86, 0.93], patience: 2, counterStep: 0.35 },
  pension: { id: 'pension', label: 'Pension fund', line: 'Buys whole buildings and does not haggle for long.', reserve: [0.97, 1.02], opening: [0.92, 0.97], patience: 2, counterStep: 0.5 },
  upsizer: { id: 'upsizer', label: 'Owner-occupier', line: 'Already sold their old flat and needs to move by spring.', reserve: [1.0, 1.06], opening: [0.93, 0.98], patience: 3, counterStep: 0.5 },
});
