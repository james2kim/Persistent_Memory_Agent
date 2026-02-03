import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import {extractMemories} from './memory/extractMemories';

// TODO: Build your persistent memory agent here
console.log('Persistent Memory Agent - ready to build!');

// Main execution
async function main() {
    console.log('Running agent loop...\n');
  
    const testInputs = [
        'Hello',
        'I prefer Typescript over Python'
    ];

    for (const input of testInputs) {
       const l =  await extractMemories(input)
       console.log(l)
    }


  }
  
  main().catch(console.error);