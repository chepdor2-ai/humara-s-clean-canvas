import { POST } from './humanizer-engine/frontend/app/api/humanize/route';

const mockReq = {
  json: async () => ({
    text: `The Role of Innovation in Modern Business Strategy

Introduction

In today’s fast-changing global economy, innovation has become essential for business success. Companies are no longer able to rely solely on traditional methods of production or marketing. Instead, they must continuously adapt to new technologies, evolving customer expectations, and competitive pressures. Innovation refers not only to creating new products but also to improving processes, services, and business models. This paper explores how innovation shapes modern business strategy and contributes to long-term growth and sustainability.

Technological Advancement and Business Innovation

Technology is one of the most powerful drivers of innovation in business. The development of digital tools such as artificial intelligence, big data, and cloud computing has transformed how companies operate. These technologies allow businesses to collect and analyze data more efficiently, leading to better decision-making. For example, companies can predict customer behavior, improve supply chain management, and personalize services. As a result, businesses become more efficient and competitive in the marketplace.`,
    engine: 'omega',
    originalSentences: `The Role of Innovation in Modern Business Strategy\n\nIntroduction\n\nIn today’s fast-changing global economy, innovation has become essential for business success. Companies are no longer able to rely solely on traditional methods of production or marketing. Instead, they must continuously adapt to new technologies, evolving customer expectations, and competitive pressures. Innovation refers not only to creating new products but also to improving processes, services, and business models. This paper explores how innovation shapes modern business strategy and contributes to long-term growth and sustainability.`.split('. ')
  })
} as any;

async function test() {
  const response = await POST(mockReq);
  const data = await response.json();
  console.log("--------------- RESULT ----------------")
  console.log(data.humanized);
}
test();
