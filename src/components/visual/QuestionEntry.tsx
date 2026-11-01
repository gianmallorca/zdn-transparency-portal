import { Link } from 'react-router-dom';
import { Building2, HeartPulse, MapPinned, Scale } from 'lucide-react';

const QUESTIONS = [
  {
    to: '/explore?focus=town',
    icon: MapPinned,
    label: "What's being built in my town?",
    hint: 'Pick a municipality on the map or from the list',
  },
  {
    to: '/explore?focus=changed',
    icon: Scale,
    label: 'What changed from last year?',
    hint: 'District offices compared with recent enacted budgets',
  },
  {
    to: '/explore?focus=health',
    icon: HeartPulse,
    label: 'Which health projects are funded?',
    hint: 'Health facilities program only',
  },
  {
    to: '/explore?focus=house',
    icon: Building2,
    label: 'What did Congress add?',
    hint: 'Lines that appear only in the House bill',
  },
] as const;

export default function QuestionEntry() {
  return (
    <section className="section questions" aria-labelledby="q-h">
      <h2 id="q-h" className="section-h">Start with a question</h2>
      <p className="section-lede">Four ways into the same live budget data — no jargon required.</p>
      <div className="question-grid">
        {QUESTIONS.map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.to} to={q.to} className="question-btn">
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              <span className="question-label">{q.label}</span>
              <span className="question-hint muted">{q.hint}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
