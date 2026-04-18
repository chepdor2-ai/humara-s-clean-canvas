import { stealthHumanize } from './humanizer-engine/frontend/lib/engine/stealth';

const text = `The Role of Innovation in Modern Business Strategy

Introduction

In today’s fast-changing global economy, innovation has become essential for business success. Companies are no longer able to rely solely on traditional methods of production or marketing. Instead, they must continuously adapt to new technologies, evolving customer expectations, and competitive pressures. Innovation refers not only to creating new products but also to improving processes, services, and business models. This paper explores how innovation shapes modern business strategy and contributes to long-term growth and sustainability.`;

console.log(stealthHumanize(text, 'medium', 'academic', 1));
