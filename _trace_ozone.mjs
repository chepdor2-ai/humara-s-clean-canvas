import http from 'http';

const text = `Public health is a field dedicated to protecting and improving the health of communities and populations. Unlike clinical medicine, which focuses on treating individuals, public health takes a broader approach by addressing the social, environmental, and behavioral factors that influence health outcomes. The goal of public health is not only to prevent disease but also to promote wellness and extend life expectancy for entire populations. One of the core functions of public health is disease prevention. This includes efforts such as vaccination programs, sanitation improvements, and public education campaigns. For example, the widespread use of vaccines has led to the near-eradication of diseases like polio and smallpox. Similarly, clean water initiatives and proper waste management have dramatically reduced the incidence of waterborne illnesses in many parts of the world. Public health also plays a critical role in responding to health emergencies. During outbreaks of infectious diseases such as COVID-19, Ebola, or influenza, public health agencies coordinate efforts to contain the spread of the virus, provide medical resources, and communicate vital information to the public. These agencies include organizations like the World Health Organization, the Centers for Disease Control and Prevention, and various national health ministries. Another important aspect of public health is health promotion. This involves educating people about healthy behaviors such as regular exercise, balanced nutrition, and avoiding harmful substances like tobacco and excessive alcohol. Health promotion also includes mental health awareness and efforts to reduce stigma around mental illness. Access to healthcare is another major concern in public health. Many communities around the world lack adequate healthcare infrastructure, leading to disparities in health outcomes. Public health professionals work to address these inequities by advocating for policy changes, improving healthcare delivery systems, and increasing access to essential services such as maternal care, immunizations, and chronic disease management. Environmental health is also a significant area of focus within public health. Pollution, climate change, and exposure to hazardous substances all have profound effects on human health. Public health experts study these environmental risks and develop strategies to mitigate their impact, such as regulating industrial emissions, promoting clean energy, and ensuring safe food and water supplies. In recent years, the field of public health has increasingly recognized the importance of data and technology. Epidemiological data is used to track disease patterns, identify risk factors, and evaluate the effectiveness of interventions. Advances in technology, including telemedicine, wearable health devices, and health information systems, have expanded the reach and efficiency of public health initiatives. Public health is a collaborative effort that requires the involvement of governments, healthcare providers, communities, and individuals. By working together, these stakeholders can create healthier environments, reduce the burden of disease, and improve the quality of life for people everywhere. The continued investment in public health infrastructure and research is essential for addressing both current and future health challenges.`;

const inputWC = text.trim().split(/\s+/).length;
console.log(`Input: ${inputWC} words`);

const data = JSON.stringify({ text, engine: 'ozone', humanizationRate: 7 });

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/humanize-stream',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
}, res => {
  let out = '';
  res.on('data', c => { out += c.toString(); });
  res.on('end', () => {
    const lines = out.split('\n').filter(l => l.startsWith('data:'));
    const stages = lines.filter(l => l.includes('"stage"')).map(l => {
      try { return JSON.parse(l.slice(5)).stage; } catch { return '?'; }
    });
    console.log('Stages:', [...new Set(stages)].join(' → '));
    const done = lines.find(l => l.includes('"type":"done"'));
    if (done) {
      const d = JSON.parse(done.slice(5));
      console.log('Done event keys:', Object.keys(d));
      const txt = d.text || d.humanized || d.result || '';
      if (txt) {
        const wc = txt.trim().split(/\s+/).length;
        console.log(`FINAL output: ${wc} words (${(wc / inputWC).toFixed(2)}x)`);
      } else {
        console.log('Done event:', JSON.stringify(d).slice(0, 300));
      }
    } else {
      console.log('No done event found');
    }
  });
});
req.write(data);
req.end();
