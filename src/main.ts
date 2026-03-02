import './style.css'
import { supabase } from './lib/supabase'
import { selectCountry } from './lib/map'

async function test() {
  const { data, error } = await supabase.from('entries').select('*')

  console.log('Data:', data, 'Error:', error)
}

test()

const sections = document.querySelectorAll('.page');

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const country = (entry.target as HTMLElement).dataset.country;
        if (country) {
          // onSectionChange(country);
          selectCountry(country);
          
        }
      }
    });
  },
  {
    threshold: 0.6 // Section gilt als aktiv, wenn 60% sichtbar
  }
);

sections.forEach(section => observer.observe(section));

