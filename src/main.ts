import './style.css'
import { supabase } from './lib/supabase'

async function test() {
  const { data, error } = await supabase.from('entries').select('*')

  console.log('Data:', data, 'Error:', error)
}

test()

document.querySelector<HTMLDivElement>('#navbar')!.innerHTML = `
    <a href="#app">Deutschland</a>
    <a href="#page_one">Australien</a>
    <a href="#page_two">Tasmanien</a>
    <a href="#page_three">Neuseeland</a>
    <a href="#page_four">Fiji</a>
    <a href="/upload.html">Upload</a>
`

// document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
//   <div>
  

//   </div>
// `

// document.querySelector<HTMLDivElement>('#page_one')!.innerHTML = `
//   <div>
//     <a href="https://vite.dev" target="_blank">
//       <img src="${viteLogo}" class="logo" alt="Vite logo" />
//     </a>
//     <a href="https://www.typescriptlang.org/" target="_blank">
//       <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
//     </a>
//     <h1>Vite + TypeScript</h1>
//     <div class="card">
//       <button id="counter" type="button"></button>
//     </div>
//     <p class="read-the-docs">
//       Click on the Vite and TypeScript logos to learn more
//     </p>
//   </div>
// `

// document.querySelector<HTMLDivElement>('#page_two')!.innerHTML = `
//   <div>
//     <a href="https://vite.dev" target="_blank">
//       <img src="${viteLogo}" class="logo" alt="Vite logo" />
//     </a>
//     <a href="https://www.typescriptlang.org/" target="_blank">
//       <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
//     </a>
//     <h1>Vite + TypeScript</h1>
//     <div class="card">
//       <button id="counter" type="button"></button>
//     </div>
//     <p class="read-the-docs">
//       Click on the Vite and TypeScript logos to learn more
//     </p>
//   </div>
// `

// setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)
