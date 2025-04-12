// Map of country names to ISO codes
const countryCodeMap = {
  'United States': 'US',
  'Brazil': 'BR',
  'Russia': 'RU',
  'United Kingdom': 'GB',
  'Canada': 'CA',
  'Australia': 'AU',
  'China': 'CN',
  'Japan': 'JP',
  'Mexico': 'MX',
  'Netherlands': 'NL',
  'France': 'FR',
  'Germany': 'DE',
  'Poland': 'PL',
  'Ireland': 'IE',
  'New Zealand': 'NZ',
  'Sweden': 'SE',
  'Ukraine': 'UA',
  'Kazakhstan': 'KZ',
  'South Korea': 'KR',
  'Spain': 'ES',
  'Thailand': 'TH',
  'Moldova': 'MD',
  'Georgia': 'GE',
  'Dagestan': 'RU', // Part of Russia
  'Chechnya': 'RU', // Part of Russia
  'Cuba': 'CU',
  'Argentina': 'AR',
  'Peru': 'PE',
  'Ecuador': 'EC',
  'Chile': 'CL',
  'Italy': 'IT',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Belgium': 'BE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Portugal': 'PT',
  'Greece': 'GR',
  'Serbia': 'RS',
  'Croatia': 'HR',
  'Romania': 'RO',
  'Bulgaria': 'BG',
  'Czech Republic': 'CZ',
  'Slovakia': 'SK',
  'Hungary': 'HU',
  'Slovenia': 'SI',
  'Estonia': 'EE',
  'Latvia': 'LV',
  'Lithuania': 'LT',
  'Belarus': 'BY',
  'Turkey': 'TR',
  'Iran': 'IR',
  'Iraq': 'IQ',
  'Israel': 'IL',
  'Jordan': 'JO',
  'Lebanon': 'LB',
  'Saudi Arabia': 'SA',
  'UAE': 'AE',
  'Afghanistan': 'AF',
  'Pakistan': 'PK',
  'India': 'IN',
  'Indonesia': 'ID',
  'Malaysia': 'MY',
  'Philippines': 'PH',
  'Vietnam': 'VN',
  'South Africa': 'ZA',
  'Nigeria': 'NG',
  'Egypt': 'EG',
  'Morocco': 'MA',
  'Algeria': 'DZ',
  'Tunisia': 'TN',
  'Cameroon': 'CM',
  'Ghana': 'GH',
  'Senegal': 'SN',
  'Jamaica': 'JM',
  'Haiti': 'HT',
  'Dominican Republic': 'DO',
  'Puerto Rico': 'PR',
  'Venezuela': 'VE',
  'Colombia': 'CO',
  'Bolivia': 'BO',
  'Paraguay': 'PY',
  'Uruguay': 'UY'
};

export const getCountryCode = (countryName) => {
  if (!countryName || countryName === 'N/A') return 'US'; // Default fallback
  
  // Clean up the country name
  const cleanName = countryName.trim().replace(/^from /i, '');
  
  // Try to find the country code
  return countryCodeMap[cleanName] || 'US';
};

export const convertInchesToHeightString = (inches) => {
  if (!inches || isNaN(inches)) return 'N/A';
  
  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;
  
  return `${feet}'${remainingInches}"`;
}; 