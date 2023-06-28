import { Box, Stack, Text } from '@chakra-ui/react'
import { ReactNode } from 'react'

export interface ConnectedUserCardType {
  walletIcon?: string
  username?: string
  icon?: ReactNode
}

export const ConnectedUserInfo = ({
  username,
  icon,
}: ConnectedUserCardType) => {
  return (
    <Stack spacing={1} alignItems="center">
      {username && (
        <>
          <Box
            display={icon ? 'block' : 'none'}
            minW={20}
            maxW={20}
            w={20}
            minH={20}
            maxH={20}
            h={20}
            borderRadius="full"
            overflow="hidden"
          >
            {icon}
          </Box>
          <Text fontSize={{ md: 'xl' }} fontWeight="semibold">
            {username}
          </Text>
        </>
      )}
    </Stack>
  )
}
