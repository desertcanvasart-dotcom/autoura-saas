// ============================================
// CONTRACT PDF GENERATOR (Server-side)
// ============================================

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

interface ContractData {
  contractNumber: string
  contractDate: string
  clientName: string
  clientEmail?: string
  numTravelers: number
  tourName: string
  startDate: string
  endDate: string
  destinations: string
  totalCost: number
  currency: string
  inclusions?: string[]
  exclusions?: string[]
}

export async function generateContractPDF(data: ContractData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  let page = pdfDoc.addPage([595, 842]) // A4 size
  
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  
  const { height } = page.getSize()
  let y = height - 50

  // Title
  page.drawText('TRAVEL CONTRACT', {
    x: 200, y, size: 20, font: helveticaBold, color: rgb(0.39, 0.49, 0.28)
  })
  y -= 30

  // Contract number
  page.drawText(`Contract: ${data.contractNumber}`, {
    x: 50, y, size: 11, font: helvetica, color: rgb(0.3, 0.3, 0.3)
  })
  y -= 15
  page.drawText(`Date: ${new Date(data.contractDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, {
    x: 50, y, size: 11, font: helvetica, color: rgb(0.3, 0.3, 0.3)
  })
  y -= 30

  // Parties
  page.drawText('PARTIES', { x: 50, y, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  y -= 20
  page.drawText('Service Provider: Travel2Egypt', { x: 50, y, size: 11, font: helvetica })
  y -= 15
  page.drawText('Website: https://travel2egypt.org', { x: 50, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
  y -= 25
  page.drawText(`Client: ${data.clientName}`, { x: 50, y, size: 11, font: helvetica })
  y -= 15
  if (data.clientEmail) {
    page.drawText(`Email: ${data.clientEmail}`, { x: 50, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
    y -= 15
  }
  page.drawText(`Travelers: ${data.numTravelers} person${data.numTravelers > 1 ? 's' : ''}`, { x: 50, y, size: 11, font: helvetica })
  y -= 35

  // Tour Details
  page.drawText('TOUR DETAILS', { x: 50, y, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  y -= 20
  page.drawText(`Tour: ${data.tourName}`, { x: 50, y, size: 11, font: helvetica })
  y -= 15
  page.drawText(`Dates: ${new Date(data.startDate).toLocaleDateString('en-GB')} - ${new Date(data.endDate).toLocaleDateString('en-GB')}`, { x: 50, y, size: 11, font: helvetica })
  y -= 15
  page.drawText(`Destinations: ${data.destinations}`, { x: 50, y, size: 11, font: helvetica })
  y -= 35

  // Financial
  page.drawText('FINANCIAL TERMS', { x: 50, y, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  y -= 20
  page.drawText(`Total Price: ${data.currency} ${data.totalCost.toLocaleString()}`, { 
    x: 50, y, size: 13, font: helveticaBold, color: rgb(0.39, 0.49, 0.28) 
  })
  y -= 20
  page.drawText('Payment: 10% deposit to confirm. Balance due upon arrival.', { x: 50, y, size: 10, font: helvetica })
  y -= 35

  // Inclusions
  if (y < 80) {
    page = pdfDoc.addPage([595, 842])
    y = 842 - 50
  }
  page.drawText('INCLUSIONS', { x: 50, y, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  y -= 18
  const inclusions = data.inclusions && data.inclusions.length > 0
    ? data.inclusions.map(i => `• ${i}`)
    : [
      '• Private transportation throughout',
      '• Licensed Egyptologist guide',
      '• Entrance fees to all sites',
      '• Accommodation as specified',
      '• Meals as mentioned',
      '• All taxes and service charges'
    ]
  for (const item of inclusions) {
    if (y < 60) {
      page = pdfDoc.addPage([595, 842])
      y = 842 - 50
    }
    page.drawText(item, { x: 55, y, size: 10, font: helvetica })
    y -= 14
  }
  y -= 20

  // Exclusions
  if (y < 80) {
    page = pdfDoc.addPage([595, 842])
    y = 842 - 50
  }
  page.drawText('EXCLUSIONS', { x: 50, y, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  y -= 18
  const exclusions = data.exclusions && data.exclusions.length > 0
    ? data.exclusions.map(e => `• ${e}`)
    : [
      '• International flights',
      '• Travel insurance',
      '• Personal expenses',
      '• Guide gratuities (optional)'
    ]
  for (const item of exclusions) {
    if (y < 60) {
      page = pdfDoc.addPage([595, 842])
      y = 842 - 50
    }
    page.drawText(item, { x: 55, y, size: 10, font: helvetica })
    y -= 14
  }
  y -= 30

  // Signatures
  page.drawText('SIGNATURES', { x: 50, y, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  y -= 25
  page.drawText('Service Provider: _________________________  Date: __________', { x: 50, y, size: 10, font: helvetica })
  y -= 25
  page.drawText('Client: _________________________  Date: __________', { x: 50, y, size: 10, font: helvetica })

  // Footer
  page.drawText('Travel2Egypt | www.travel2egypt.org | info@travel2egypt.org', {
    x: 150, y: 30, size: 9, font: helvetica, color: rgb(0.5, 0.5, 0.5)
  })

  return await pdfDoc.save()
}