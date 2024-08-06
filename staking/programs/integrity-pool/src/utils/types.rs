#[allow(non_camel_case_types)]
// It is used to store fractional numbers with 6 decimal places
// The number 6 is coming from the decimal places of the PYTH token
pub type frac64 = u64;

pub const FRAC_64_MULTIPLIER: u64 = 1_000_000;
pub const FRAC_64_MULTIPLIER_U128: u128 = FRAC_64_MULTIPLIER as u128;


pub struct BoolArray {
    pub data: Vec<u8>,
}

impl BoolArray {
    pub fn new(n: usize) -> Self {
        Self {
            data: vec![0; (n + 7) / 8],
        }
    }

    pub fn get(&self, i: usize) -> bool {
        let byte = i / 8;
        let bit = i % 8;
        self.data[byte] & (1 << bit) != 0
    }

    pub fn set(&mut self, i: usize) {
        let byte = i / 8;
        let bit = i % 8;
        self.data[byte] |= 1 << bit;
    }
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        publisher_caps::MAX_CAPS,
    };

    #[test]
    fn test_bool_array() {
        let mut arr = BoolArray::new(10);
        for i in 0..10 {
            assert!(!arr.get(i));
            arr.set(i);
            assert!(arr.get(i));
        }

        let mut arr = BoolArray::new(MAX_CAPS);
        for i in 0..MAX_CAPS {
            assert!(!arr.get(i));
            arr.set(i);
            assert!(arr.get(i));
        }
    }
}
