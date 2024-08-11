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
    use super::*;

    #[test]
    fn test_bool_array() {
        let mut arr = BoolArray::new(10);
        for i in 0..10 {
            assert!(!arr.get(i));
            arr.set(i);
            assert!(arr.get(i));
        }

        let mut arr = BoolArray::new(1024);
        for i in 0..1024 {
            assert!(!arr.get(i));
            arr.set(i);
            assert!(arr.get(i));
        }
    }
}
